// app/routes/api.seo.sync.js
// ═══ Kimono SEO — SEO Stratul 1: Shopify Product Sync ═══

import { createAdminClient } from "../lib/integrations/shopify/client.server.js";

const PRODUCTS_QUERY = `#graphql
  query fetchProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, query: "status:active") {
      edges {
        cursor
        node { id title productType vendor tags }
      }
      pageInfo { hasNextPage }
    }
  }
`;

export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { connection, storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });

  const admin = createAdminClient(connection.shopDomain, connection.accessToken);
  const body  = await request.json().catch(() => ({}));
  const { isFirst, cursor } = body;

  try {
    if (isFirst) {
      await prisma.seoProduct.deleteMany({ where: { storeId } });
      await prisma.seoCandidate.deleteMany({ where: { storeId } });
      await prisma.seoSyncLog.create({
        data: { storeId, status: "RUNNING", totalProducts: 0, syncedProducts: 0 },
      });
    }

    const resp = await admin.graphql(PRODUCTS_QUERY, {
      variables: { first: 100, after: cursor || null },
    });
    const data        = await resp.json();
    const edges       = data.data?.products?.edges || [];
    const hasNextPage = data.data?.products?.pageInfo?.hasNextPage || false;
    const nextCursor  = edges.length > 0 ? edges[edges.length - 1].cursor : null;

    if (edges.length > 0) {
      await prisma.$transaction(
        edges.map(({ node: p }) =>
          prisma.seoProduct.upsert({
            where:  { storeId_productId: { storeId, productId: p.id } },
            update: { productTitle: p.title, status: "pending" },
            create: { storeId, productId: p.id, productTitle: p.title, status: "pending" },
          })
        )
      );
    }

    const synced = await prisma.seoProduct.count({ where: { storeId } });
    await prisma.seoSyncLog.updateMany({
      where: { storeId, status: "RUNNING" },
      data:  { syncedProducts: synced },
    });

    if (!hasNextPage) {
      await prisma.seoSyncLog.updateMany({
        where: { storeId, status: "RUNNING" },
        data:  { status: "DONE", totalProducts: synced, finishedAt: new Date() },
      });
    }

    return Response.json({ success: true, data: { synced, done: !hasNextPage, nextCursor: hasNextPage ? nextCursor : null } });
  } catch (err) {
    console.error("[SEO Sync]", err);
    await prisma.seoSyncLog.updateMany({
      where: { storeId, status: "RUNNING" },
      data:  { status: "FAILED", errorMessage: err.message, finishedAt: new Date() },
    }).catch(() => {});
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
};
