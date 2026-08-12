// app/routes/api.ai-citations.js
// User-facing API for the AI Citations / GEO tracking module.
// Intents: save_brand, generate_prompts, list_prompts, save_prompt, delete_prompt,
//          start_scan, cancel_scan, get_scan, list_scans.

import { requireAuth } from "../lib/auth/index.server.js";
import prisma from "../db.server.js";
import { hashPrompt } from "../lib/seo/ai-citations/extractors.server.js";

export const action = async ({ request }) => {
  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "Store not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const { intent } = body;

  if (intent === "save_brand") {
    const { brandName, aliases = [], domains = [], competitors = [], scheduleFrequency, scheduleRunsPerPrompt } = body;
    if (!brandName?.trim()) return Response.json({ success: false, error: "Brand name required" }, { status: 400 });
    const sched = ["off", "weekly", "monthly"].includes(scheduleFrequency) ? scheduleFrequency : "off";
    const runs  = Math.min(Math.max(parseInt(scheduleRunsPerPrompt || 3, 10), 1), 10);
    const saved = await prisma.aiBrandConfig.upsert({
      where:  { storeId },
      update: { brandName: brandName.trim(), aliases: JSON.stringify(aliases), domains: JSON.stringify(domains), competitors: JSON.stringify(competitors), scheduleFrequency: sched, scheduleRunsPerPrompt: runs },
      create: { storeId, brandName: brandName.trim(), aliases: JSON.stringify(aliases), domains: JSON.stringify(domains), competitors: JSON.stringify(competitors), scheduleFrequency: sched, scheduleRunsPerPrompt: runs },
    });
    return Response.json({ success: true, brand: saved });
  }

  if (intent === "generate_prompts") {
    try {
      const { enforceTrialLimit } = await import("../lib/trial-limits.server.js");
      await enforceTrialLimit(storeId, "ai_prompt_gens", 1);
      const { generatePromptLibrary } = await import("../lib/seo/ai-citations/prompt-generator.server.js");
      const { inserted, generated } = await generatePromptLibrary(storeId, { count: body.count || 25 });
      return Response.json({ success: true, inserted, generated });
    } catch (e) {
      if (e.code === "TRIAL_LIMIT") return Response.json({ success: false, error: e.message }, { status: 429 });
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  if (intent === "save_prompt") {
    const { id, text, intent: promptIntent } = body;
    if (!text?.trim()) return Response.json({ success: false, error: "Prompt text required" }, { status: 400 });
    const textHash = hashPrompt(text.trim());
    try {
      if (id) {
        const updated = await prisma.aiPrompt.update({ where: { id }, data: { text: text.trim(), intent: promptIntent || null, textHash } });
        return Response.json({ success: true, prompt: updated });
      } else {
        const created = await prisma.aiPrompt.create({
          data: { storeId, text: text.trim(), intent: promptIntent || null, source: "manual", status: "active", textHash },
        });
        return Response.json({ success: true, prompt: created });
      }
    } catch (e) {
      if (e.code === "P2002") return Response.json({ success: false, error: "Duplicate prompt already exists" }, { status: 409 });
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  // Soft-archive: AiCitationRun has onDelete:Cascade on promptId, so a hard delete
  // would wipe scan history. Archive lets the UI hide the prompt while keeping
  // the underlying citation evidence.
  if (intent === "archive_prompt") {
    const { id } = body;
    await prisma.aiPrompt.updateMany({ where: { id, storeId }, data: { status: "archived" } });
    return Response.json({ success: true });
  }

  if (intent === "restore_prompt") {
    const { id } = body;
    await prisma.aiPrompt.updateMany({ where: { id, storeId }, data: { status: "active" } });
    return Response.json({ success: true });
  }

  // Bulk archive — clean slate before regenerating without losing history.
  if (intent === "archive_all_active") {
    const r = await prisma.aiPrompt.updateMany({
      where: { storeId, status: "active" },
      data:  { status: "archived" },
    });
    return Response.json({ success: true, archived: r.count });
  }

  // Hard delete from archive (kept for cleanup of obvious junk). Cascades to runs.
  if (intent === "delete_prompt_hard") {
    const { id } = body;
    await prisma.aiPrompt.deleteMany({ where: { id, storeId } });
    return Response.json({ success: true });
  }

  // Back-compat shim: old "delete_prompt" intent now archives.
  if (intent === "delete_prompt") {
    const { id } = body;
    await prisma.aiPrompt.updateMany({ where: { id, storeId }, data: { status: "archived" } });
    return Response.json({ success: true });
  }

  if (intent === "start_scan") {
    const platforms = Array.isArray(body.platforms) && body.platforms.length > 0
      ? body.platforms
      : ["claude", "chatgpt", "aio"];
    const runsPerPrompt = Math.min(Math.max(parseInt(body.runsPerPrompt || 3, 10), 1), 10);

    try {
      const { enforceTrialLimit } = await import("../lib/trial-limits.server.js");
      await enforceTrialLimit(storeId, "ai_citation_scans", 1);
    } catch (e) {
      if (e.code === "TRIAL_LIMIT") return Response.json({ success: false, error: e.message }, { status: 429 });
      throw e;
    }

    // Cancel any in-flight scan first (prevents N parallel scans burning budget).
    await prisma.aiCitationScan.updateMany({
      where: { storeId, status: "RUNNING" },
      data:  { status: "CANCELLED", finishedAt: new Date(), errorMessage: "Superseded by new scan" },
    });

    const promptCount = await prisma.aiPrompt.count({ where: { storeId, status: "active" } });
    if (promptCount === 0) return Response.json({ success: false, error: "No active prompts. Generate or add prompts first." }, { status: 400 });

    const scan = await prisma.aiCitationScan.create({
      data: { storeId, platforms: JSON.stringify(platforms), runsPerPrompt, promptCount, status: "RUNNING" },
    });

    // Detached background promise — same pattern as job-processor.
    (async () => {
      try {
        const { runCitationScan } = await import("../lib/seo/ai-citations/scan.server.js");
        await runCitationScan({ scanId: scan.id, storeId });
      } catch (e) {
        console.error("[AiCitations] background scan failed:", e.message);
        await prisma.aiCitationScan.update({ where: { id: scan.id }, data: { status: "FAILED", errorMessage: e.message, finishedAt: new Date() } }).catch(() => {});
      }
    })();

    return Response.json({ success: true, scanId: scan.id });
  }

  if (intent === "cancel_scan") {
    const { scanId } = body;
    await prisma.aiCitationScan.updateMany({
      where: { id: scanId, storeId, status: "RUNNING" },
      data:  { status: "CANCELLED", finishedAt: new Date() },
    });
    return Response.json({ success: true });
  }

  if (intent === "get_scan") {
    const { scanId } = body;
    const { getScanResults } = await import("../lib/seo/ai-citations/scan.server.js");
    const result = await getScanResults(scanId);
    if (!result || result.scan.storeId !== storeId) return Response.json({ success: false, error: "Scan not found" }, { status: 404 });
    return Response.json({ success: true, ...result });
  }

  if (intent === "recommendations") {
    const { scanId } = body;
    const scan = await prisma.aiCitationScan.findUnique({ where: { id: scanId }, select: { storeId: true, status: true } });
    if (!scan || scan.storeId !== storeId) return Response.json({ success: false, error: "Scan not found" }, { status: 404 });
    if (scan.status !== "DONE") return Response.json({ success: false, error: "Scan must be DONE before generating recommendations" }, { status: 400 });
    try {
      const { generateRecommendations } = await import("../lib/seo/ai-citations/recommendations.server.js");
      const result = await generateRecommendations(scanId);
      return Response.json({ success: true, ...result });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  return Response.json({ success: false, error: "Unknown intent" }, { status: 400 });
};
