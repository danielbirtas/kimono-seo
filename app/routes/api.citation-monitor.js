// app/routes/api.citation-monitor.js
import prisma from "../db.server.js";

export async function loader({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const [brandSetting, compSetting, saved] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "brand_name" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "citation_competitors" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId: store.id, key: "citation_results" } } }),
  ]);
  let data = null;
  if (saved?.value) { try { data = JSON.parse(saved.value); } catch {} }
  return Response.json({
    data,
    brandName:   brandSetting?.value || "",
    competitors: compSetting?.value  || "",
    dfsActive:   !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD),
  });
}

export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const body = await request.json().catch(() => ({}));

  if (body.intent === "save_settings") {
    const updates = [];
    if (body.competitors !== undefined) updates.push(
      prisma.seoSetting.upsert({
        where:  { storeId_key: { storeId: store.id, key: "citation_competitors" } },
        create: { storeId: store.id, key: "citation_competitors", value: body.competitors },
        update: { value: body.competitors },
      })
    );
    await Promise.all(updates);
    return Response.json({ success: true });
  }

  if (body.intent === "monitor") {
    try {
      const { runCitationMonitor } = await import("../lib/seo/citation-monitor.server.js");
      const result = await runCitationMonitor(store.id);
      return Response.json({ success: true, ...result });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
