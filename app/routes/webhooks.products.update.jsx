// app/routes/webhooks.products.update.jsx
// Shopify webhook: products/update → update title; preserve aiTag.

import prisma from "../db.server.js";
import { verifyShopifyWebhook } from "../lib/webhook-verify.server.js";

export const action = async ({ request }) => {
  const { storeId } = await verifyShopifyWebhook(request);
  const payload = await request.json().catch(() => ({}));

  const productId = payload?.admin_graphql_api_id || (payload?.id ? `gid://shopify/Product/${payload.id}` : null);
  const title     = payload?.title || "";
  if (!productId) return new Response("OK", { status: 200 });

  // Upsert preserves aiTag/status. If product was soft-deleted earlier, resurrect to pending.
  await prisma.seoProduct.upsert({
    where:  { storeId_productId: { storeId, productId } },
    update: {
      productTitle: title,
      status: { set: undefined },  // keep current status unless it was "deleted"
    },
    create: { storeId, productId, productTitle: title, status: "pending" },
  });

  // Resurrect from soft-delete only if Shopify still considers it active
  if (payload?.status === "active") {
    await prisma.seoProduct.updateMany({
      where: { storeId, productId, status: "deleted" },
      data:  { status: "pending" },
    });
  }

  return new Response("OK", { status: 200 });
};

export const loader = () => new Response("OK", { status: 200 });
