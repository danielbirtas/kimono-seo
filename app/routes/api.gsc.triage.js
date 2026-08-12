// app/routes/api.gsc.triage.js
// Kimono SEO — GSC Keyword Triage API (#01)

import { runGscTriage, getTriageResults } from "../lib/seo/gsc-triage.server.js";

export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });
  const body   = await request.json().catch(() => ({}));
  const { intent, action: filterAction } = body;

  // ── Run triage now ──
  if (intent === "run") {
    try {
      const result = await runGscTriage(storeId);
      return Response.json({ success: true, ...result });
    } catch (err) {
      return Response.json({ success: false, error: err.message });
    }
  }

  // ── Get results ──
  if (intent === "results") {
    try {
      const results = await getTriageResults(storeId, filterAction || null);
      const counts  = {
        audit:   results.filter((r) => r.action === "AUDIT").length,
        blog:    results.filter((r) => r.action === "BLOG").length,
        monitor: results.filter((r) => r.action === "MONITOR").length,
      };
      const lastRun = results[0]?.triagedAt || null;
      return Response.json({ success: true, results, counts, lastRun });
    } catch (err) {
      return Response.json({ success: false, error: err.message });
    }
  }

  return Response.json({ success: false, error: "Unknown intent" });
};