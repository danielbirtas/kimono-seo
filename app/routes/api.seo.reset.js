// app/routes/api.seo.reset.js
// ═══ Kimono SEO — SEO Reset Data API ═══


export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store connection." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const what = body.what || "all";

  try {
    if (what === "tags") {
      await prisma.seoProduct.updateMany({
        where: { storeId },
        data:  { aiTag: null, aiSub: null, status: "pending", shopifyTagApplied: false },
      });
    } else {
      await prisma.$transaction([
        prisma.seoProduct.deleteMany({ where: { storeId } }),
        prisma.seoKeyword.deleteMany({ where: { storeId } }),
      ]);
    }
    return Response.json({ success: true, data: { message: "OK" } });
  } catch (error) {
    console.error("[SEO Reset]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
};