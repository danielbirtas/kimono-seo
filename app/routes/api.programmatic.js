// app/routes/api.programmatic.js — Programmatic SEO API
import { requireAuth } from "../lib/auth/index.server.js";

export async function loader({ request }) {
  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store." }, { status: 400 });
  const { listTemplates } = await import("../lib/seo/programmatic-seo.server.js");
  const templates = await listTemplates(storeId);
  return Response.json({ templates });
}

export async function action({ request }) {
  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const intent = body.intent;

  const lib = await import("../lib/seo/programmatic-seo.server.js");

  try {
    if (intent === "create_template") {
      const t = await lib.createTemplate(storeId, body.input || {});
      return Response.json({ success: true, template: t });
    }
    if (intent === "suggest_tokens") {
      const suggestions = await lib.suggestTokensForPattern(storeId, body.pattern || "BEST_X_FOR_Y");
      return Response.json({ success: true, suggestions });
    }
    if (intent === "update_template") {
      const t = await lib.updateTemplate(body.templateId, body.input || {});
      return Response.json({ success: true, template: t });
    }
    if (intent === "delete_template") {
      await lib.deleteTemplate(body.templateId);
      return Response.json({ success: true });
    }
    if (intent === "generate_rows") {
      const res = await lib.generateRows(body.templateId);
      return Response.json({ success: true, ...res });
    }
    if (intent === "enrich_template") {
      const res = await lib.enrichTemplate(body.templateId, body.limit || 50);
      return Response.json({ success: true, ...res });
    }
    if (intent === "check_cannibal") {
      const res = await lib.checkCannibalization(body.rowId);
      return Response.json({ success: true, ...res });
    }
    if (intent === "generate_content") {
      const res = await lib.generateContentForRow(body.rowId);
      return Response.json({ success: true, sections: res });
    }
    if (intent === "quality_check") {
      const res = await lib.runQualityChecks(body.rowId);
      return Response.json({ success: true, ...res });
    }
    if (intent === "publish_row") {
      const res = await lib.publishRow(body.rowId);
      return Response.json({ success: true, ...res });
    }
    if (intent === "create_batch") {
      const batch = await lib.createBatch(body.templateId, body.size || 50);
      return Response.json({ success: true, batchId: batch.id });
    }
    if (intent === "run_batch") {
      const res = await lib.runBatch(body.batchId);
      return Response.json({ success: true, ...res });
    }
    if (intent === "list_rows") {
      const rows = await lib.listRows(body.templateId, { status: body.status, limit: body.limit });
      const stats = await lib.statsForTemplate(body.templateId);
      return Response.json({ success: true, rows, stats });
    }
    if (intent === "update_row_status") {
      const { default: prisma } = await import("../db.server.js");
      await prisma.pSeoRow.update({ where: { id: body.rowId }, data: { status: body.status } });
      return Response.json({ success: true });
    }
    return Response.json({ error: "Unknown intent" }, { status: 400 });
  } catch (e) {
    console.error("[pSEO API]", e);
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
}
