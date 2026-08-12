// app/routes/api.seo.status.js
// ═══ Kimono SEO — SEO Status API ═══

import { createAdminClient } from "../lib/integrations/shopify/client.server.js";
import { getProductCount } from "../lib/seo/shopify.server.js";

export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { connection, storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });

  const admin = createAdminClient(connection.shopDomain, connection.accessToken);

  const [totalProducts, scanned, tagged, uniqueTagsRows, totalKeywords, categoriesCreated] =
    await Promise.all([
      getProductCount(admin),
      prisma.seoProduct.count({ where: { storeId } }),
      prisma.seoProduct.count({ where: { storeId, aiTag: { not: null }, NOT: { aiTag: "" } } }),
      prisma.seoProduct.findMany({ where: { storeId, aiTag: { not: null }, NOT: { aiTag: "" } }, distinct: ["aiTag"], select: { aiTag: true } }),
      prisma.seoKeyword.count({ where: { storeId } }),
      prisma.seoKeyword.count({ where: { storeId, collectionCreated: true } }),
    ]);

  return Response.json({
    success: true,
    data: { totalProducts, scanned, tagged, uniqueTags: uniqueTagsRows.length, totalKeywords, categoriesCreated },
  });
};