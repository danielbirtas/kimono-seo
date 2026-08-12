// app/routes/webhooks.products.delete.jsx
// Shopify webhook: products/delete → soft-delete SeoProduct (status="deleted").
// Full delete with related content is handled by reconcile cron after grace period.

import prisma from "../db.server.js";
import { verifyShopifyWebhook } from "../lib/webhook-verify.server.js";

export const action = async ({ request }) => {
  const { storeId } = await verifyShopifyWebhook(request);
  const payload = await request.json().catch(() => ({}));

  const productId = payload?.admin_graphql_api_id || (payload?.id ? `gid://shopify/Product/${payload.id}` : null);
  if (!productId) return new Response("OK", { status: 200 });

  await prisma.seoProduct.updateMany({
    where: { storeId, productId },
    data:  { status: "deleted" },
  });

  return new Response("OK", { status: 200 });
};

export const loader = () => new Response("OK", { status: 200 });
