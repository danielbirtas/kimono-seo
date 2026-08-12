// app/lib/webhook-verify.server.js
// Verify Shopify webhook via per-store URL secret stored in SeoSetting.
// Returns { ok: true, storeId } on success, throws Response 401 on fail.

import prisma from "../db.server.js";

export async function verifyShopifyWebhook(request) {
  const url = new URL(request.url);
  const providedSecret = url.searchParams.get("s");
  const shopDomain = request.headers.get("x-shopify-shop-domain");

  if (!providedSecret || !shopDomain) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const store = await prisma.store.findUnique({
    where: { shopDomain },
    select: { id: true },
  });
  if (!store) throw new Response("Unknown shop", { status: 401 });

  const setting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId: store.id, key: "webhook_secret" } },
    select: { value: true },
  });
  if (!setting?.value) throw new Response("Webhook secret not set", { status: 401 });

  // Constant-time comparison to prevent timing attacks
  if (!constantTimeEqual(providedSecret, setting.value)) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return { ok: true, storeId: store.id, shopDomain };
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Build callback URL including store secret for Shopify webhook registration.
export function webhookCallbackUrl(path, secret) {
  const base = process.env.APP_URL || "http://localhost:3000";
  return `${base}${path}?s=${encodeURIComponent(secret)}`;
}
