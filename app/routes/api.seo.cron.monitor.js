// app/routes/api.seo.cron.monitor.js
// Sprint 5 — Weekly SEO Monitor Cron
//
// Hit by GitHub Actions cron (weekly). For each store with GSC connected:
// 1. Refresh GSC data (90 days)
// 2. Re-run ECS scoring for products with new GSC data
// 3. Detect CTR anomalies
// 4. Detect large clusters + duplicates
// 5. Run cannibalization detection
//
// Auth: CRON_SECRET header (same pattern as ai-citations runner)

import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("X-Cron-Secret");
  if (!expected || expected !== provided) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find all stores with GSC connected (have gsc_refresh_token setting)
  const gscStores = await prisma.seoSetting.findMany({
    where:  { key: "seo_gsc_refresh_token", NOT: { value: "" } },
    select: { storeId: true },
  });

  const results = [];

  for (const { storeId } of gscStores) {
    const storeResult = { storeId, steps: {} };

    // 1. GSC Refresh
    try {
      const { syncGscDataForStore } = await import("../lib/seo/gsc-sync.server.js");
      const gsc = await syncGscDataForStore(storeId, { lookbackDays: 90 });
      storeResult.steps.gscSync = { ok: true, rows: gsc.rowsPersisted, matched: gsc.productsMatched };
    } catch (e) {
      storeResult.steps.gscSync = { ok: false, error: e.message };
    }

    // 2. CTR Anomaly Detection
    try {
      const { detectCtrAnomalies } = await import("../lib/seo/ctr-anomaly.server.js");
      const ctr = await detectCtrAnomalies(storeId);
      storeResult.steps.ctrAnomalies = { ok: true, scanned: ctr.scanned, anomalies: ctr.anomalies };
    } catch (e) {
      storeResult.steps.ctrAnomalies = { ok: false, error: e.message };
    }

    // 3. Cluster Split + Duplicate Detection
    try {
      const { runAllDetectors } = await import("../lib/seo/cluster-detector.server.js");
      const det = await runAllDetectors(storeId);
      storeResult.steps.detectors = { ok: true, ...det };
    } catch (e) {
      storeResult.steps.detectors = { ok: false, error: e.message };
    }

    // 4. Cannibalization Detection
    try {
      const { runCannibalizationDetection } = await import("../lib/seo/cannibalization.server.js");
      const cannibal = await runCannibalizationDetection(storeId);
      storeResult.steps.cannibalization = { ok: true, total: cannibal.totalKeywords, cannibalized: cannibal.cannibalized };
    } catch (e) {
      storeResult.steps.cannibalization = { ok: false, error: e.message };
    }

    // 5. ECS Re-evaluation (score products that have GSC data changes)
    try {
      const allocatedCount = await prisma.seoCandidate.count({ where: { storeId, ecsAllocated: true } });
      if (allocatedCount > 0) {
        // Reset allocations and re-run
        await prisma.seoCandidate.updateMany({
          where: { storeId },
          data:  { ecsAllocated: false },
        });
        const { selectKeywordsForStore } = await import("../lib/seo/keyword-selector.server.js");
        let done = false, totalAllocated = 0, offset = 0;
        while (!done) {
          const result = await selectKeywordsForStore(storeId, { batchSize: 50, offset });
          totalAllocated += result.stats.allocated;
          offset += 50;
          done = result.done;
        }
        storeResult.steps.ecsReeval = { ok: true, allocated: totalAllocated };
      } else {
        storeResult.steps.ecsReeval = { ok: true, skipped: "no previous allocations" };
      }
    } catch (e) {
      storeResult.steps.ecsReeval = { ok: false, error: e.message };
    }

    results.push(storeResult);
  }

  return Response.json({
    success: true,
    storesProcessed: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
};
