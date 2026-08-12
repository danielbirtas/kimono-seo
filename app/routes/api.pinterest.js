// app/routes/api.pinterest.js — standalone (non-Shopify)
import { requireAuth } from "../lib/auth/index.server.js";

export async function loader({ request }) {
  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store." }, { status: 400 });
  const { getPinterestAuditResults } = await import("../lib/seo/pinterest-seo.server.js");
  return Response.json(await getPinterestAuditResults(storeId));
}

export async function action({ request }) {
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store." }, { status: 400 });

  const body = await request.json().catch(() => ({}));

  if (body.intent === "save_token") {
    const { savePinterestToken } = await import("../lib/seo/pinterest-seo.server.js");
    await savePinterestToken(storeId, body.token || "");
    return Response.json({ success: true });
  }

  if (body.intent === "audit") {
    try {
      const { runPinterestAudit } = await import("../lib/seo/pinterest-seo.server.js");
      const token = body.token; // optional override
      const result = await runPinterestAudit(storeId, connection?.shopDomain || "", token);
      return Response.json({ success: true, ...result });
    } catch (e) {
      console.error("[Pinterest] audit error:", e.message);
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  if (body.intent === "auto_post") {
    try {
      const { autoPostPins } = await import("../lib/seo/pinterest-seo.server.js");
      const result = await autoPostPins(storeId, connection?.shopDomain || "", body.token, body.options || {});
      return Response.json({ success: true, ...result });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
