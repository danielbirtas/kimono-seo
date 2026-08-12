// app/routes/api.seo.reconcile.js
// Nightly safety net (cron 3 AM): diff Shopify vs local SeoProduct.
// Fixes: webhooks missed, products changed outside (bulk operations), orphans cleanup.

import prisma from "../db.server.js";

const PAGE_SIZE = 250;

export const loader = async ({ request }) => {
  const secret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("s") || "";
  if (secret !== (process.env.CRON_SECRET || "")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true, shopDomain: true } });
  const results = [];

  for (const store of stores) {
    try {
      const r = await reconcileStore(store);
      results.push({ storeId: store.id, ...r });
      await prisma.storeSettings.upsert({
        where:  { storeId: store.id },
        update: { lastReconcileAt: new Date() },
        create: { storeId: store.id, lastReconcileAt: new Date() },
      });
    } catch (e) {
      results.push({ storeId: store.id, error: e.message });
    }
  }

  return Response.json({ ok: true, timestamp: new Date().toISOString(), stores: results });
};

async function reconcileStore({ id: storeId, shopDomain }) {
  const conn = await prisma.storeConnection.findFirst({
    where:   { shopDomain, isActive: true },
    orderBy: { connectedAt: "desc" },
    select:  { accessToken: true },
  });
  if (!conn?.accessToken) return { skipped: "no-connection" };

  // Fetch all active product IDs from Shopify (paginated)
  const shopifyIds = new Set();
  let cursor = null;
  let safetyCounter = 0;
  do {
    if (++safetyCounter > 500) break; // 500 × 250 = 125k products max
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const query = `{
      products(first: ${PAGE_SIZE}${afterClause}, query: "status:active") {
        edges { cursor node { id } }
        pageInfo { hasNextPage }
      }
    }`;
    const resp = await fetch(`https://${shopDomain}/admin/api/2025-04/graphql.json`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": conn.accessToken },
      body:    JSON.stringify({ query }),
    });
    if (!resp.ok) throw new Error(`Shopify GraphQL ${resp.status}`);
    const data = await resp.json();
    const edges = data?.data?.products?.edges || [];
    for (const e of edges) shopifyIds.add(e.node.id);
    const hasNext = data?.data?.products?.pageInfo?.hasNextPage;
    cursor = hasNext && edges.length ? edges[edges.length - 1].cursor : null;
    if (!cursor) break;
  } while (true);

  // Local non-deleted products
  const localRows = await prisma.seoProduct.findMany({
    where: { storeId, status: { not: "deleted" } },
    select: { productId: true, id: true },
  });
  const localIds = new Set(localRows.map(r => r.productId));

  // Missing in local → insert as pending
  const missing = [...shopifyIds].filter(id => !localIds.has(id));
  if (missing.length > 0) {
    // Need titles — fetch in small batches
    for (let i = 0; i < missing.length; i += 50) {
      const batch = missing.slice(i, i + 50);
      const titles = await fetchTitles(shopDomain, conn.accessToken, batch);
      for (const [id, title] of Object.entries(titles)) {
        await prisma.seoProduct.upsert({
          where:  { storeId_productId: { storeId, productId: id } },
          update: { productTitle: title, status: "pending" },
          create: { storeId, productId: id, productTitle: title, status: "pending" },
        }).catch(() => {});
      }
    }
  }

  // Orphan in local (not in shopify any more) → soft-delete
  const orphan = localRows.filter(r => !shopifyIds.has(r.productId));
  if (orphan.length > 0) {
    await prisma.seoProduct.updateMany({
      where: { id: { in: orphan.map(r => r.id) } },
      data:  { status: "deleted" },
    });
  }

  const summary = { shopify: shopifyIds.size, local: localRows.length, missing: missing.length, orphan: orphan.length };
  if (missing.length > 100 || orphan.length > 100) {
    console.warn(`[reconcile] LARGE DIFF for ${shopDomain}:`, summary);
  }
  return summary;
}

async function fetchTitles(shopDomain, accessToken, ids) {
  const query = `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { id title } } }`;
  const resp = await fetch(`https://${shopDomain}/admin/api/2025-04/graphql.json`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body:    JSON.stringify({ query, variables: { ids } }),
  });
  if (!resp.ok) return {};
  const data = await resp.json();
  const map = {};
  for (const node of (data?.data?.nodes || [])) {
    if (node?.id && node?.title) map[node.id] = node.title;
  }
  return map;
}
