// app/lib/integrations/woocommerce/client.server.js
// WooCommerce REST API v3 client
// accessToken format: "consumer_key:consumer_secret"

/**
 * Parse the stored accessToken into key + secret.
 */
function parseAuth(accessToken) {
  const idx = accessToken.indexOf(":");
  if (idx < 0) throw new Error("Invalid WooCommerce token format — expected 'consumer_key:consumer_secret'");
  return {
    key:    accessToken.slice(0, idx),
    secret: accessToken.slice(idx + 1),
  };
}

function authHeader(accessToken) {
  const { key, secret } = parseAuth(accessToken);
  const encoded = Buffer.from(`${key}:${secret}`).toString("base64");
  return { "Authorization": `Basic ${encoded}`, "Content-Type": "application/json" };
}

/**
 * Make a WooCommerce REST API call.
 */
export async function wooRequest(domain, accessToken, method, endpoint, body = null) {
  const url = `https://${domain}/wp-json/wc/v3/${endpoint}`;
  const opts = { method, headers: authHeader(accessToken) };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(url, opts);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`WooCommerce ${method} ${endpoint}: ${resp.status} — ${text.slice(0, 120)}`);
  }
  return resp.json();
}

/**
 * Test that a domain + consumer_key:consumer_secret pair is valid.
 */
export async function testWooConnection(domain, accessToken) {
  try {
    // Fetch one product to validate credentials
    const data = await wooRequest(domain, accessToken, "GET", "products?per_page=1");
    // If we got here without throwing, the connection is valid
    // Try to get store name from site info
    let shopName = domain;
    try {
      const info = await fetch(`https://${domain}/wp-json/wc/v3/settings/general/woocommerce_store_address`, {
        headers: authHeader(accessToken),
      });
      if (info.ok) {
        const siteResp = await fetch(`https://${domain}/wp-json`, { headers: { "Content-Type": "application/json" } });
        if (siteResp.ok) {
          const siteData = await siteResp.json();
          shopName = siteData.name || domain;
        }
      }
    } catch { /* shopName stays as domain */ }
    return { ok: true, shopName };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Fetch all WooCommerce products for the store (returns normalized format).
 * Used during initial sync.
 */
export async function fetchAllWooProducts(domain, accessToken) {
  const results = [];
  let page = 1;
  while (true) {
    const products = await wooRequest(domain, accessToken, "GET", `products?per_page=100&page=${page}&status=publish`);
    if (!Array.isArray(products) || products.length === 0) break;
    for (const p of products) {
      results.push({ id: `woo-${p.id}`, title: p.name || "" });
    }
    if (products.length < 100) break;
    page++;
    await sleep(200);
  }
  return results;
}

/**
 * Fetch full product details for a list of product IDs.
 * IDs use the "woo-{numericId}" prefix format.
 */
export async function fetchWooProductDetails(domain, accessToken, productIds) {
  const results = [];
  for (const pid of productIds) {
    try {
      const numericId = pid.replace(/^woo-/, "");
      const p = await wooRequest(domain, accessToken, "GET", `products/${numericId}`);
      results.push(normalizeProduct(p));
      await sleep(100);
    } catch (err) {
      console.warn(`[WooCommerce] fetchProductDetails failed for ${pid}:`, err.message);
    }
  }
  return results;
}

/**
 * Apply SEO mutations to a WooCommerce product.
 * Supports: product_title, meta_title (Yoast), meta_desc (Yoast), handle (slug), alt_text
 */
export async function applyWooSeo(domain, accessToken, product, mutations) {
  const numericId = product.id.replace(/^woo-/, "");
  const updateData = {};
  const metaData   = [];

  for (const m of mutations) {
    if (m.field === "product_title") updateData.name = m.value;
    if (m.field === "handle")        updateData.slug = m.value;
    if (m.field === "meta_title") {
      // Yoast SEO plugin stores meta title in _yoast_wpseo_title meta field
      metaData.push({ key: "_yoast_wpseo_title", value: m.value });
    }
    if (m.field === "meta_desc") {
      metaData.push({ key: "_yoast_wpseo_metadesc", value: m.value });
    }
  }

  if (metaData.length > 0) updateData.meta_data = metaData;

  if (Object.keys(updateData).length > 0) {
    await wooRequest(domain, accessToken, "PUT", `products/${numericId}`, updateData);
    console.log(`[WooCommerce] SEO updated for product ${numericId}`);
  }

  // Alt text — update images array
  const altMutation = mutations.find((m) => m.field === "alt_text");
  if (altMutation && Array.isArray(altMutation.value)) {
    const p = await wooRequest(domain, accessToken, "GET", `products/${numericId}`);
    const images = (p.images || []).map((img, i) => ({
      ...img,
      alt: altMutation.value[i] !== undefined ? altMutation.value[i] : img.alt,
    }));
    await wooRequest(domain, accessToken, "PUT", `products/${numericId}`, { images });
    console.log(`[WooCommerce] Alt texts updated for product ${numericId}`);
  }
}

// ── INTERNAL ──

function normalizeProduct(p) {
  // Extract SEO fields from Yoast SEO (most common plugin) or use defaults
  const yoastTitle = p.yoast_head_json?.title || "";
  const yoastDesc  = p.yoast_head_json?.description || "";
  const metaTitle  = p.meta_data?.find((m) => m.key === "_yoast_wpseo_title")?.value || yoastTitle || p.name || "";
  const metaDesc   = p.meta_data?.find((m) => m.key === "_yoast_wpseo_metadesc")?.value || yoastDesc || "";

  return {
    id:          `woo-${p.id}`,
    title:       p.name || "",
    handle:      p.slug || "",
    description: (p.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500),
    seoTitle:    metaTitle,
    seoDesc:     metaDesc,
    images:      (p.images || []).map((img) => ({
      id:      `woo-img-${img.id}`,
      url:     img.src || "",
      altText: img.alt || "",
    })),
  };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
