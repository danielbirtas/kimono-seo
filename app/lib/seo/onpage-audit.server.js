// app/lib/seo/onpage-audit.server.js
// ═══ Kimono SEO — On-Page Audit Engine (#02) ═══
// Audits meta title, meta description, handle, body content per product.
// Uses Claude to analyze and suggest improvements.

import prisma from "../../db.server.js";

const TITLE_MIN   = 40;
const TITLE_MAX   = 60;
const DESC_MIN    = 120;
const DESC_MAX    = 160;
const BATCH_SIZE  = 8; // products per Claude call

/**
 * Run on-page audit for a batch of products.
 * Called from job-processor as a new job type AUDIT.
 */
export async function runAuditBatch(storeId, shopDomain, accessToken) {
  // Get products not yet audited
  const pending = await prisma.seoProduct.findMany({
    where: { storeId },
    select: { productId: true, productTitle: true },
    take: BATCH_SIZE * 2,
  });

  const alreadyAudited = await prisma.seoAudit.findMany({
    where: { storeId },
    select: { productId: true },
  });
  const auditedIds = new Set(alreadyAudited.map((a) => a.productId));
  const batch      = pending.filter((p) => !auditedIds.has(p.productId)).slice(0, BATCH_SIZE);

  if (batch.length === 0) {
    const total   = await prisma.seoProduct.count({ where: { storeId } });
    const audited = await prisma.seoAudit.count({ where: { storeId } });
    return { done: true, processed: audited, total, message: `All ${total} products audited.` };
  }

  // Fetch full product data from Shopify
  const productData = await fetchProductsData(shopDomain, accessToken, batch.map((p) => p.productId));

  // Run audit via audit-processor (Anthropic-based)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic API key not configured.");

  // Delegate to proper audit pipeline (uses current schema field names)
  const { auditProductInline, getBrandSettings } = await import("./audit-processor.server.js");
  const brand = await getBrandSettings(storeId);

  // Normalize old format to new format expected by auditProductInline
  const normalizedData = productData.map((p) => ({
    id:          p.productId,
    title:       p.productTitle || "",
    handle:      p.handle || "",
    description: (p.bodyHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500),
    seoTitle:    p.metaTitle || "",
    seoDesc:     p.metaDescription || "",
    images:      [],
  }));

  for (const product of normalizedData) {
    try {
      const result = await auditProductInline(apiKey, product, brand);
      await prisma.seoAudit.upsert({
        where:  { storeId_productId: { storeId, productId: product.id } },
        update: {
          productTitle:   product.title,
          productHandle:  product.handle || "",
          score:          result.score,
          metaTitleScore: result.metaTitleScore,
          metaDescScore:  result.metaDescScore,
          h1Score:        result.h1Score,
          handleScore:    result.handleScore,
          imageScore:     result.imageScore,
          ogScore:        result.ogScore,
          findings:       JSON.stringify(result.findings),
          suggestions:    JSON.stringify(result.suggestions),
          auditedAt:      new Date(),
        },
        create: {
          storeId,
          productId:      product.id,
          productTitle:   product.title,
          productHandle:  product.handle || "",
          score:          result.score,
          metaTitleScore: result.metaTitleScore,
          metaDescScore:  result.metaDescScore,
          h1Score:        result.h1Score,
          handleScore:    result.handleScore,
          imageScore:     result.imageScore,
          ogScore:        result.ogScore,
          findings:       JSON.stringify(result.findings),
          suggestions:    JSON.stringify(result.suggestions),
        },
      }).catch((err) => console.warn("[Audit] upsert failed:", err.message));
    } catch (pErr) {
      console.warn(`[Audit] product ${product.id}:`, pErr.message);
    }
  }

  const totalProducts = await prisma.seoProduct.count({ where: { storeId } });
  const totalAudited  = await prisma.seoAudit.count({ where: { storeId } });
  const remaining     = totalProducts - totalAudited;

  return {
    done:      remaining <= 0,
    processed: totalAudited,
    total:     totalProducts,
    message:   `Audited ${totalAudited}/${totalProducts} products...`,
  };
}

// ─── FETCH PRODUCT DATA FROM SHOPIFY ───
async function fetchProductsData(shopDomain, accessToken, productIds) {
  const results = [];
  for (const productId of productIds) {
    try {
      const numericId = productId.replace("gid://shopify/Product/", "");
      const resp = await fetch(`https://${shopDomain}/admin/api/2025-04/products/${numericId}.json`, {
        headers: { "X-Shopify-Access-Token": accessToken },
      });
      if (!resp.ok) continue;
      const { product: p } = await resp.json();
      results.push({
        productId:       productId,
        productTitle:    p.title || "",
        productUrl:      `https://${shopDomain}/products/${p.handle}`,
        handle:          p.handle || "",
        bodyHtml:        p.body_html || "",
        metaTitle:       p.metafields_global_title_tag || p.title || "",
        metaDescription: p.metafields_global_description_tag || "",
      });
      await sleep(300); // Shopify rate limit friendly
    } catch (err) {
      console.warn(`[Audit] fetch failed for ${productId}:`, err.message);
    }
  }
  return results;
}

// ─── CLAUDE AUDIT ───
async function auditWithClaude(apiKey, products) {
  if (products.length === 0) return [];

  const productList = products.map((p, i) => `
Product ${i + 1}:
ID: ${p.productId}
Title: ${p.productTitle}
Handle: ${p.handle}
Meta Title: ${p.metaTitle || "(not set)"}
Meta Description: ${p.metaDescription || "(not set)"}
Body (first 300 chars): ${(p.bodyHtml || "").replace(/<[^>]+>/g, "").slice(0, 300)}
`).join("\n---\n");

  const prompt = `You are an SEO expert auditing Shopify product pages. Analyze each product and return a JSON array.

For each product evaluate:
1. META TITLE: Should be ${TITLE_MIN}-${TITLE_MAX} chars, contain main keyword, be unique, no keyword stuffing
2. META DESCRIPTION: Should be ${DESC_MIN}-${DESC_MAX} chars, contain CTA, describe product clearly
3. HANDLE (URL slug): Should be clean, keyword-rich, no stop words like "the", "a", "for"
4. CONTENT: Body description quality — too short (<100 words), missing specs, no benefits

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "productId": "gid://shopify/Product/...",
    "scoreTitle": 0-100,
    "scoreDescription": 0-100,
    "scoreHandle": 0-100,
    "scoreContent": 0-100,
    "findings": [
      {
        "field": "meta_title|meta_description|handle|content",
        "severity": "critical|warning|info",
        "issue": "short description of the problem",
        "suggestion": "exact suggested fix or text (under 160 chars for meta)"
      }
    ]
  }
]

Rules:
- Score 90-100 = excellent, 70-89 = good, 50-69 = needs work, 0-49 = critical
- Only include findings for actual issues, not things that are fine
- For meta title/description suggestions, provide the actual suggested text
- For Romanian products, suggestions should be in Romanian
- Max 4 findings per product

Products to audit:
${productList}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages:   [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) throw new Error(`Anthropic ${resp.status}`);
  const data = await resp.json();
  const text = data.content?.[0]?.text?.trim() || "[]";

  let auditData = [];
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    auditData   = JSON.parse(clean);
  } catch (err) {
    console.error("[Audit] JSON parse failed:", err.message);
    return [];
  }

  // Merge with original product data
  return auditData.map((audit) => {
    const original = products.find((p) => p.productId === audit.productId) || {};
    const scores   = [audit.scoreTitle, audit.scoreDescription, audit.scoreHandle, audit.scoreContent].filter(Boolean);
    const overall  = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return {
      ...original,
      scoreOverall:    overall,
      scoreTitle:      audit.scoreTitle      || 0,
      scoreDescription: audit.scoreDescription || 0,
      scoreHandle:     audit.scoreHandle     || 0,
      scoreContent:    audit.scoreContent    || 0,
      findings:        audit.findings        || [],
    };
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
