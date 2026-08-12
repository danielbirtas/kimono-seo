// app/lib/seo/job-recovery.server.js
// Boot-time and periodic recovery for SeoJob rows that are stuck in RUNNING
// because a previous Node process was killed mid-execution (Railway redeploy,
// OOM, etc.). Auto-resumes EXTRACT jobs because they're naturally idempotent
// (NOT EXISTS antijoin in processExtractBatch skips already-extracted products),
// so progress survives every container restart.
//
// Not auto-resumed: SYNC (cursor state), ENRICH (DataForSEO costs money),
// TAXONOMY (one-shot, manual control preferred).

import prisma from "../../db.server.js";

const STALE_THRESHOLD_MS = 3 * 60 * 1000;        // periodic mode: job stale if no update in 3 min
const RESUME_LOOKBACK_MS = 60 * 60 * 1000;       // look back 1h for cancelled/failed work to resume
const PERIODIC_INTERVAL  = 5 * 60 * 1000;        // re-check every 5 min while server is alive
// AUDIT excluded from auto-resume: it makes Shopify API calls that need
// a valid session token, which may not be refreshable at boot time.
// User can Resume manually from On-Page SEO page.
const RESUMABLE_TYPES    = ["EXTRACT", "TAG"];

let started = false;

export async function recoverZombieJobs({ aggressive = false } = {}) {
  // 1) Mark zombie RUNNING jobs as CANCELLED so the UI stops showing a spinner
  //    forever and so the resume step below can detect them.
  const zombieWhere = aggressive
    ? { status: "RUNNING" }
    : { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - STALE_THRESHOLD_MS) } };

  const zombies = await prisma.seoJob.findMany({
    where:  zombieWhere,
    select: { id: true, storeId: true, type: true },
  });

  for (const z of zombies) {
    await prisma.seoJob.update({
      where: { id: z.id },
      data:  { status: "CANCELLED", finishedAt: new Date(), errorMessage: "Container restarted — recovering" },
    }).catch(() => {});
  }
  if (zombies.length > 0) console.log(`[job-recovery] cancelled ${zombies.length} zombie job(s)`);

  // 2) For each store with a recently cancelled/failed resumable job, check if
  //    there's still pending work and queue a fresh background runner. The
  //    NOT EXISTS antijoin in processExtractBatch ensures we only touch
  //    products that don't yet have candidates, so this is safe to re-trigger.
  const since = new Date(Date.now() - RESUME_LOOKBACK_MS);
  const cancelled = await prisma.seoJob.findMany({
    where:    { type: { in: RESUMABLE_TYPES }, status: { in: ["CANCELLED", "FAILED"] }, finishedAt: { gte: since } },
    distinct: ["storeId", "type"],
    select:   { storeId: true, type: true },
  });

  let resumed = 0;
  for (const c of cancelled) {
    // Skip if there's already an active job of the same type for this store
    const active = await prisma.seoJob.findFirst({
      where:  { storeId: c.storeId, type: c.type, status: { in: ["QUEUED", "RUNNING"] } },
      select: { id: true },
    });
    if (active) continue;

    if (c.type === "EXTRACT") {
      const remaining = await prisma.$queryRaw`
        SELECT 1 FROM "SeoProduct" sp
        WHERE sp."storeId" = ${c.storeId}
          AND NOT EXISTS (
            SELECT 1 FROM "SeoCandidate" sc
            WHERE sc."storeId" = sp."storeId" AND sc."productId" = sp."productId"
          )
        LIMIT 1
      `;
      if (remaining.length === 0) continue;
    }
    if (c.type === "TAG") {
      const remaining = await prisma.seoProduct.count({ where: { storeId: c.storeId, OR: [{ aiTag: null }, { aiTag: "" }] } });
      if (remaining === 0) continue;
    }
    if (c.type === "AUDIT") {
      const remaining = await prisma.$queryRaw`
        SELECT 1 FROM "SeoProduct" sp
        LEFT JOIN "SeoAudit" sa ON sa."storeId" = sp."storeId" AND sa."productId" = sp."productId"
        WHERE sp."storeId" = ${c.storeId} AND sa."productId" IS NULL
        LIMIT 1
      `;
      if (remaining.length === 0) continue;
    }

    const job = await prisma.seoJob.create({
      data: { storeId: c.storeId, type: c.type, status: "QUEUED", statusMessage: "Auto-resumed after restart" },
    });
    const { processJobInBackground } = await import("./job-processor.server.js");
    processJobInBackground(job.id, c.storeId, c.type).catch(e => console.error(`[job-recovery] resume ${c.type} failed:`, e.message));
    resumed++;
    console.log(`[job-recovery] auto-resumed ${c.type} for store ${c.storeId} (job ${job.id})`);
  }

  return { zombiesCancelled: zombies.length, resumed };
}

// Idempotent — call once at server boot. Subsequent calls are no-op.
export function startJobRecovery() {
  if (started) return;
  started = true;

  // Boot pass: aggressive mode marks every RUNNING row CANCELLED (any RUNNING at
  // boot is, by definition, a zombie because no process was alive to update it).
  // 10s delay so Railway network + DB pool are fully ready before we make API calls.
  setTimeout(() => {
    recoverZombieJobs({ aggressive: true }).catch(e => console.error("[job-recovery] boot pass:", e.message));
  }, 10000);

  // Periodic safety net: catches jobs that died mid-run after boot (background
  // promises that throw uncaught, OOM, etc.).
  setInterval(() => {
    recoverZombieJobs({ aggressive: false }).catch(e => console.error("[job-recovery] periodic:", e.message));
  }, PERIODIC_INTERVAL);
}
