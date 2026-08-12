// app/routes/api.seo.scan.js
// ═══ Kimono SEO — SEO Scan Products API ═══

import { createAdminClient } from "../lib/integrations/shopify/client.server.js";
import { fetchAllProducts } from "../lib/seo/shopify.server.js";

export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { connection, storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });

  const admin = createAdminClient(connection.shopDomain, connection.accessToken);
  const body  = await request.json().catch(() => ({}));
  const cursor  = body.cursor || null;
  const isFirst = body.isFirst || false;

  try {
    if (isFirst) {
      await prisma.seoProduct.deleteMany({ where: { storeId } });
    }

    const { products, hasNextPage, cursor: nextCursor } = await fetchAllProducts(admin, cursor, 100);

    if (products.length > 0) {
      await prisma.$transaction(
        products.map((p) =>
          prisma.seoProduct.upsert({
            where:  { storeId_productId: { storeId, productId: p.id } },
            update: { productTitle: p.title },
            create: { storeId, productId: p.id, productTitle: p.title, status: "pending" },
          })
        )
      );
    }

    const scanned = await prisma.seoProduct.count({ where: { storeId } });
    return Response.json({ success: true, data: { scanned, batchSize: products.length, done: !hasNextPage, nextCursor: hasNextPage ? nextCursor : null } });
  } catch (error) {
    console.error("[SEO Scan]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
};
