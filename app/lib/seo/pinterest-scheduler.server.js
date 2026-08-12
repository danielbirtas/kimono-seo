// app/lib/seo/pinterest-scheduler.server.js
// In-process scheduler for ScheduledPin rows.
// - Each pending pin has a setTimeout in this Node process.
// - On container restart, ensureSchedulerArmed() (called from
//   api.pinterest loader) processes overdue pins and re-arms timers.
// - Catch-up + arming is debounced to ~60s so per-request calls are cheap.

import prisma from "../../db.server.js";

// Node setTimeout max delay: 2^31 - 1 ms ≈ 24.85 days. We chain for longer.
const MAX_TIMEOUT_MS    = 2_000_000_000;     // ~23.1 days, conservative
const REARM_LOOKAHEAD_S = 60 * 60 * 24 * 35; // arm timers for pins due in <= 35 days
const ENSURE_DEBOUNCE_MS = 60_000;
const PROCESS_BATCH_SIZE = 50;

// pinId → NodeJS.Timeout
const timers = new Map();
let lastEnsuredAt = 0;
let processingPromise = null;

async function processOnePin(pinId) {
  try {
    const { processDueScheduledPins } = await import("./pinterest-seo.server.js");
    // Process a batch — usually picks up just this pin (and any others due
    // by the same instant). Idempotent: any post errors are already retried.
    await processDueScheduledPins({ batchSize: PROCESS_BATCH_SIZE, maxAttempts: 3 });
  } catch (e) {
    console.error("[Pinterest scheduler] processOnePin error:", e.message);
  } finally {
    timers.delete(pinId);
  }
}

export function armPinTimer(pin) {
  if (!pin?.id || pin.status !== "pending") return;
  if (timers.has(pin.id)) return; // already armed

  const dueIn = pin.scheduledFor.getTime() - Date.now();

  if (dueIn <= 0) {
    // Due now/past — fire immediately on next tick
    const t = setTimeout(() => processOnePin(pin.id), 0);
    timers.set(pin.id, t);
    return;
  }

  if (dueIn > MAX_TIMEOUT_MS) {
    // Chain: re-arm closer to the due date
    const t = setTimeout(() => {
      timers.delete(pin.id);
      armPinTimer(pin);
    }, MAX_TIMEOUT_MS);
    timers.set(pin.id, t);
    return;
  }

  const t = setTimeout(() => processOnePin(pin.id), dueIn);
  timers.set(pin.id, t);
}

export function disarmPinTimer(pinId) {
  const t = timers.get(pinId);
  if (t) {
    clearTimeout(t);
    timers.delete(pinId);
  }
}

export function rearmPinTimer(pin) {
  disarmPinTimer(pin.id);
  armPinTimer(pin);
}

// Called from request loaders. Idempotent + debounced.
// 1) Processes any overdue pending pins (catch-up after restart/idle)
// 2) Arms timers for upcoming pending pins within REARM_LOOKAHEAD_S
export async function ensureSchedulerArmed({ force = false } = {}) {
  if (!force && Date.now() - lastEnsuredAt < ENSURE_DEBOUNCE_MS) return;
  if (processingPromise) return processingPromise;

  processingPromise = (async () => {
    lastEnsuredAt = Date.now();
    try {
      const { processDueScheduledPins } = await import("./pinterest-seo.server.js");
      // Catch-up: process anything overdue (might be empty)
      await processDueScheduledPins({ batchSize: PROCESS_BATCH_SIZE, maxAttempts: 3 });

      // Arm timers for upcoming pending pins
      const horizon = new Date(Date.now() + REARM_LOOKAHEAD_S * 1000);
      const upcoming = await prisma.scheduledPin.findMany({
        where: {
          status:       "pending",
          attempts:     { lt: 3 },
          scheduledFor: { lte: horizon },
        },
        orderBy: { scheduledFor: "asc" },
        take:    500,
      });
      for (const pin of upcoming) armPinTimer(pin);
    } catch (e) {
      console.error("[Pinterest scheduler] ensureSchedulerArmed error:", e.message);
    } finally {
      processingPromise = null;
    }
  })();

  return processingPromise;
}

// For diagnostics
export function getSchedulerState() {
  return {
    armedTimers:  timers.size,
    lastEnsuredAt: lastEnsuredAt ? new Date(lastEnsuredAt).toISOString() : null,
    isProcessing: !!processingPromise,
  };
}
