// app/routes/api.ai-citations.runner.js
// Cron tick for the AI Citations scheduled-scan feature. Hit every 10 min by
// .github/workflows/cron-schedulers.yml. Picks stores whose schedule cadence
// has elapsed and kicks off a scan as a detached background promise.

import prisma from "../db.server.js";

const FREQ_MS = {
  weekly:  7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export const loader = async ({ request }) => {
  // Same fail-closed guard used by the other cron runners — if CRON_SECRET
  // isn't set, refuse rather than letting world traffic trigger AI spend.
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("X-Cron-Secret");
  if (!expected || expected !== provided) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidates = await prisma.aiBrandConfig.findMany({
    where:  { scheduleFrequency: { in: Object.keys(FREQ_MS) } },
    select: { id: true, storeId: true, scheduleFrequency: true, scheduleRunsPerPrompt: true, lastScheduledScanAt: true, store: { select: { plan: true } } },
  });

  let triggered = 0, skippedNotDue = 0, skippedNoPrompts = 0, skippedRunning = 0, skippedWrongPlan = 0;

  for (const cfg of candidates) {
    // Only SCALE / GROWTH get auto-scans — FREE / STARTER can run manual scans
    // within their trial cap but don't get the convenience of scheduling.
    if (!["SCALE", "GROWTH"].includes(cfg.store?.plan)) { skippedWrongPlan++; continue; }

    const interval = FREQ_MS[cfg.scheduleFrequency];
    const elapsed  = cfg.lastScheduledScanAt ? Date.now() - new Date(cfg.lastScheduledScanAt).getTime() : Infinity;
    if (elapsed < interval) { skippedNotDue++; continue; }

    // Don't pile up scans if one is already in flight.
    const inFlight = await prisma.aiCitationScan.findFirst({ where: { storeId: cfg.storeId, status: "RUNNING" } });
    if (inFlight) { skippedRunning++; continue; }

    const promptCount = await prisma.aiPrompt.count({ where: { storeId: cfg.storeId, status: "active" } });
    if (promptCount === 0) { skippedNoPrompts++; continue; }

    const scan = await prisma.aiCitationScan.create({
      data: {
        storeId: cfg.storeId,
        platforms: JSON.stringify(["claude", "chatgpt", "aio"]),
        runsPerPrompt: cfg.scheduleRunsPerPrompt,
        promptCount,
        status: "RUNNING",
      },
    });
    await prisma.aiBrandConfig.update({ where: { id: cfg.id }, data: { lastScheduledScanAt: new Date() } });

    // Fire-and-forget detached promise. Errors get caught and marked on the scan
    // row by the runCitationScan function itself.
    (async () => {
      try {
        const { runCitationScan } = await import("../lib/seo/ai-citations/scan.server.js");
        await runCitationScan({ scanId: scan.id, storeId: cfg.storeId });
      } catch (e) {
        console.error("[AiCitationsRunner] scan failed:", e.message);
      }
    })();

    triggered++;
  }

  console.log(`[AiCitationsRunner] candidates=${candidates.length} triggered=${triggered} not_due=${skippedNotDue} no_prompts=${skippedNoPrompts} running=${skippedRunning} wrong_plan=${skippedWrongPlan}`);
  return Response.json({ ok: true, triggered, skipped: { notDue: skippedNotDue, noPrompts: skippedNoPrompts, running: skippedRunning, wrongPlan: skippedWrongPlan } });
};
