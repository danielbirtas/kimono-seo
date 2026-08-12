// app/lib/seo/pseo-scheduler.server.js
// In-process scheduler for SCHEDULED PSeoRow drip-publishing + periodic
// refresh job. Same pattern as pinterest-scheduler.server.js:
// - Each SCHEDULED row gets a setTimeout in the Node process.
// - ensurePseoSchedulerArmed() runs on every relevant request loader
//   (debounced ~60s). It catches up overdue rows + re-arms upcoming
//   timers + checks if the daily refresh cron is due.
// - No external pinger needed. While any user is using the app, the
//   scheduler stays warm.

import prisma from "../../db.server.js";

const MAX_TIMEOUT_MS       = 2_000_000_000;     // ~23.1 days, safe under setTimeout cap
const REARM_LOOKAHEAD_S    = 60 * 60 * 24 * 35; // arm timers for rows due in <= 35 days
const ENSURE_DEBOUNCE_MS   = 60_000;            // skip if last ensure < 60s ago
const REFRESH_INTERVAL_MS  = 24 * 60 * 60 * 1000;
const DRIP_BATCH_SIZE      = 50;

// rowId → NodeJS.Timeout
const timers = new Map();
let lastEnsuredAt = 0;
let lastRefreshRanAt = 0;
let processingPromise = null;

async function processOneRow(rowId) {
  try {
    const { runDripCron } = await import("./programmatic-seo.server.js");
    // Pull anything currently due — usually just this row, plus a few
    // adjacent ones that happen to land in the same tick. The drip cron
    // also enforces the per-store 50/24h cap so it can't burst-publish.
    await runDripCron({ maxPerStore: DRIP_BATCH_SIZE });
  } catch (e) {
    console.error("[pSEO scheduler] processOneRow error:", e.message);
  } finally {
    timers.delete(rowId);
  }
}

export function armRowTimer(row) {
  if (!row?.id || row.status !== "SCHEDULED" || !row.scheduledFor) return;
  if (timers.has(row.id)) return;

  const dueIn = row.scheduledFor.getTime() - Date.now();

  if (dueIn <= 0) {
    const t = setTimeout(() => processOneRow(row.id), 0);
    timers.set(row.id, t);
    return;
  }

  if (dueIn > MAX_TIMEOUT_MS) {
    // Chain: re-arm closer to due date once we get within range
    const t = setTimeout(() => {
      timers.delete(row.id);
      armRowTimer(row);
    }, MAX_TIMEOUT_MS);
    timers.set(row.id, t);
    return;
  }

  const t = setTimeout(() => processOneRow(row.id), dueIn);
  timers.set(row.id, t);
}

export function disarmRowTimer(rowId) {
  const t = timers.get(rowId);
  if (t) {
    clearTimeout(t);
    timers.delete(rowId);
  }
}

// Idempotent + debounced. Called from app.programmatic.jsx loader (and
// optionally app.jsx loader) on every page visit. Cheap to call frequently.
export async function ensurePseoSchedulerArmed({ force = false } = {}) {
  if (!force && Date.now() - lastEnsuredAt < ENSURE_DEBOUNCE_MS) return;
  if (processingPromise) return processingPromise;

  processingPromise = (async () => {
    lastEnsuredAt = Date.now();
    try {
      const { runDripCron, runRefreshCron } = await import("./programmatic-seo.server.js");

      // Catch-up drip: process anything currently overdue.
      await runDripCron({ maxPerStore: DRIP_BATCH_SIZE }).catch(e =>
        console.error("[pSEO scheduler] catch-up drip:", e.message));

      // Refresh cron — run at most once per 24h. The function itself only
      // touches rows older than its ageDays threshold, so calling it more
      // often wouldn't hurt, but we guard anyway to keep AI spend predictable.
      if (Date.now() - lastRefreshRanAt > REFRESH_INTERVAL_MS) {
        lastRefreshRanAt = Date.now();
        runRefreshCron().catch(e =>
          console.error("[pSEO scheduler] refresh:", e.message));
      }

      // Arm in-process timers for upcoming SCHEDULED rows
      const horizon = new Date(Date.now() + REARM_LOOKAHEAD_S * 1000);
      const upcoming = await prisma.pSeoRow.findMany({
        where: {
          status: "SCHEDULED",
          scheduledFor: { lte: horizon },
        },
        orderBy: { scheduledFor: "asc" },
        take: 500,
        select: { id: true, status: true, scheduledFor: true },
      });
      for (const row of upcoming) armRowTimer(row);
    } catch (e) {
      console.error("[pSEO scheduler] ensure error:", e.message);
    } finally {
      processingPromise = null;
    }
  })();

  return processingPromise;
}

export function getPseoSchedulerState() {
  return {
    armedTimers: timers.size,
    lastEnsuredAt: lastEnsuredAt ? new Date(lastEnsuredAt).toISOString() : null,
    lastRefreshRanAt: lastRefreshRanAt ? new Date(lastRefreshRanAt).toISOString() : null,
    isProcessing: !!processingPromise,
  };
}
