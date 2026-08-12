// app/routes/webhooks.products.create.jsx
// Shopify webhook: products/create → upsert SeoProduct as pending.
// Target <500ms response time. No expensive processing here — kicker cron picks up.

import prisma from "../db.server.js";
import { verifyShopifyWebhook } from "../lib/webhook-verify.server.js";

export const action = async ({ request }) => {
  const { storeId } = await verifyShopifyWebhook(request);
  const payload = await request.json().catch(() => ({}));

  const productId = payload?.admin_graphql_api_id || (payload?.id ? `gid://shopify/Product/${payload.id}` : null);
  const title     = payload?.title || "";
  if (!productId || !title) return new Response("OK", { status: 200 });

  await prisma.seoProduct.upsert({
    where:  { storeId_productId: { storeId, productId } },
    update: { productTitle: title },
    create: { storeId, productId, productTitle: title, status: "pending" },
  });

  return new Response("OK", { status: 200 });
};

// Shopify will not GET webhooks, but 200 for health checks.
export const loader = () => new Response("OK", { status: 200 });
