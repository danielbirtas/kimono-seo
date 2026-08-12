// app/routes/api.bing-ai.js
import prisma from "../db.server.js";

export async function loader({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const { getBingAiResults } = await import("../lib/seo/bing-ai-performance.server.js");
  return Response.json(await getBingAiResults(store.id));
}

export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const body = await request.json().catch(() => ({}));

  if (body.intent === "save_settings") {
    const { saveBingSettings } = await import("../lib/seo/bing-ai-performance.server.js");
    await saveBingSettings(store.id, body.apiKey || "", body.siteUrl || "");
    return Response.json({ success: true });
  }

  if (body.intent === "fetch") {
    try {
      const { runBingAiPerformance } = await import("../lib/seo/bing-ai-performance.server.js");
      const result = await runBingAiPerformance(store.id);
      return Response.json({ success: true, ...result });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
