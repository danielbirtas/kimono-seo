// app/routes/api.content-decay.js
// Kimono SEO #19 — Content Decay Detection API

import prisma from "../db.server.js";

export async function loader({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const { getDecayResults } = await import("../lib/seo/content-decay.server.js");
  const saved = await getDecayResults(store.id);
  return Response.json({ data: saved });
}

export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const body = await request.json().catch(() => ({}));

  if (body.intent === "scan") {
    try {
      const { detectContentDecay } = await import("../lib/seo/content-decay.server.js");
      const result = await detectContentDecay(store.id);
      return Response.json({ success: true, ...result });
    } catch (e) {
      console.error("[Decay API] scan error:", e.message);
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
