// app/routes/api.intent-shift.js
import prisma from "../db.server.js";

export async function loader({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const { getIntentShiftResults, getMonitoredKeywords } = await import("../lib/seo/intent-shift.server.js");
  const [data, keywords] = await Promise.all([
    getIntentShiftResults(store.id),
    getMonitoredKeywords(store.id),
  ]);
  return Response.json({ data, keywords: keywords.join("\n") });
}

export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const body = await request.json().catch(() => ({}));

  if (body.intent === "save_keywords") {
    const { saveMonitoredKeywords } = await import("../lib/seo/intent-shift.server.js");
    await saveMonitoredKeywords(store.id, body.keywords || "");
    return Response.json({ success: true });
  }

  if (body.intent === "run") {
    try {
      const { runIntentShiftDetection } = await import("../lib/seo/intent-shift.server.js");
      const result = await runIntentShiftDetection(store.id);
      return Response.json({ success: true, ...result });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
