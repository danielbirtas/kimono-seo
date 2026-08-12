// app/routes/api.indexnow.js
// Kimono SEO — IndexNow Manual Submit API

import { getIndexNowKey, submitToIndexNow } from "../lib/seo/indexnow.server.js";

export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });
  const body   = await request.json().catch(() => ({}));
  const { intent, urls } = body;

  // ── Get key + status ──
  if (intent === "status") {
    const apiKey = await getIndexNowKey(storeId);
    const enabled = await prisma.seoSetting.findUnique({
      where: { storeId_key: { storeId, key: "seo_indexnow_enabled" } },
    });
    return Response.json({
      success: true,
      apiKey,
      enabled: enabled?.value === "true",
      keyUrl:  `https://${shopDomain}/${apiKey}.txt`,
      verifyUrl: `https://api.indexnow.org/indexnow?url=https://${shopDomain}&key=${apiKey}`,
    });
  }

  // ── Submit all products ──
  if (intent === "submit_products") {
    const apiKey   = await getIndexNowKey(storeId);
    const products = await prisma.seoProduct.findMany({
      where:  { storeId },
      select: { productId: true },
      take:   200,
    });

    // Get handles from Shopify
    const sess = await prisma.storeConnection.findFirst({
      where: { shopDomain, isActive: true }, orderBy: { connectedAt: "desc" },
    });
    if (!sess?.accessToken) return Response.json({ success: false, error: "No store connection" });

    const productUrls = [];
    for (const p of products.slice(0, 100)) {
      try {
        const numId = p.productId.replace("gid://shopify/Product/", "");
        const resp  = await fetch(`https://${shopDomain}/admin/api/2025-04/products/${numId}.json?fields=handle`, {
          headers: { "X-Shopify-Access-Token": sess.accessToken },
        });
        if (resp.ok) {
          const { product } = await resp.json();
          if (product?.handle) productUrls.push(`https://${shopDomain}/products/${product.handle}`);
        }
        await new Promise((r) => setTimeout(r, 200));
      } catch {}
    }

    if (productUrls.length === 0) return Response.json({ success: false, error: "No product URLs found" });

    const result = await submitToIndexNow(shopDomain, productUrls, apiKey);
    return Response.json({ success: true, submitted: result.submitted, total: productUrls.length });
  }

  // ── Submit custom URLs ──
  if (intent === "submit_urls") {
    if (!urls?.length) return Response.json({ success: false, error: "No URLs provided" });
    const apiKey = await getIndexNowKey(storeId);
    const result = await submitToIndexNow(shopDomain, urls, apiKey);
    return Response.json({ success: true, submitted: result.submitted, total: urls.length });
  }

  return Response.json({ success: false, error: "Unknown intent" });
};