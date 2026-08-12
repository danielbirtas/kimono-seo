// app/routes/api.competitor-gap.js
import prisma from "../db.server.js";

export async function loader({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const { getCompetitorGapResults } = await import("../lib/seo/competitor-gap.server.js");
  return Response.json({ data: await getCompetitorGapResults(store.id) });
}

export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const body = await request.json().catch(() => ({}));

  if (body.intent === "save_competitors") {
    await prisma.seoSetting.upsert({
      where:  { storeId_key: { storeId: store.id, key: "gap_competitors" } },
      create: { storeId: store.id, key: "gap_competitors", value: body.competitors || "" },
      update: { value: body.competitors || "" },
    });
    if (body.seedKeywords !== undefined) await prisma.seoSetting.upsert({
      where:  { storeId_key: { storeId: store.id, key: "gap_seed_keywords" } },
      create: { storeId: store.id, key: "gap_seed_keywords", value: body.seedKeywords || "" },
      update: { value: body.seedKeywords || "" },
    });
    if (body.minVolume !== undefined) await prisma.seoSetting.upsert({
      where:  { storeId_key: { storeId: store.id, key: "gap_min_volume" } },
      create: { storeId: store.id, key: "gap_min_volume", value: String(body.minVolume) },
      update: { value: String(body.minVolume) },
    });
    return Response.json({ success: true });
  }

  if (body.intent === "analyze") {
    try {
      const { runCompetitorGapAnalysis } = await import("../lib/seo/competitor-gap.server.js");
      const result = await runCompetitorGapAnalysis(store.id, connection.shopDomain);
      return Response.json({ success: true, ...result });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
