// app/lib/seo/schema-validator.server.js
// Kimono SEO M23 — Schema Validator: extract JSON-LD from pages, validate against schema.org rules

import prisma from "../../db.server.js";
import crypto from "node:crypto";

function sha1(s) { return crypto.createHash("sha1").update(s).digest("hex"); }

// Required fields per schema type (subset of schema.org + Google rich result requirements)
const REQUIRED_FIELDS = {
  Product:        ["@type", "name", "image"],
  Article:        ["@type", "headline", "author", "datePublished"],
  BlogPosting:    ["@type", "headline", "author", "datePublished"],
  NewsArticle:    ["@type", "headline", "author", "datePublished"],
  FAQPage:        ["@type", "mainEntity"],
  BreadcrumbList: ["@type", "itemListElement"],
  Organization:   ["@type", "name", "url"],
  LocalBusiness:  ["@type", "name", "address"],
  Review:         ["@type", "reviewRating", "author"],
  Recipe:         ["@type", "name", "image", "recipeIngredient", "recipeInstructions"],
  VideoObject:    ["@type", "name", "thumbnailUrl", "uploadDate"],
};

const ELIGIBLE_RICH_RESULTS = {
  Product:        ["product-snippet", "merchant-listing"],
  Article:        ["article"],
  BlogPosting:    ["article"],
  NewsArticle:    ["article"],
  FAQPage:        ["faq"],
  BreadcrumbList: ["breadcrumb"],
  Organization:   ["logo", "sitelinks-searchbox"],
  LocalBusiness:  ["local-business"],
  Review:         ["review-snippet"],
  Recipe:         ["recipe"],
  VideoObject:    ["video"],
};

function extractJsonLdFromHtml(html) {
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    try { out.push(JSON.parse(m[1].trim())); } catch { /* skip invalid JSON */ }
  }
  return out;
}

function flattenSchemas(schemas) {
  const all = [];
  for (const s of schemas) {
    if (Array.isArray(s)) all.push(...s);
    else if (s && typeof s === "object" && s["@graph"]) all.push(...s["@graph"]);
    else if (s) all.push(s);
  }
  return all;
}

function validateItem(item) {
  const rawType = item["@type"];
  const type    = Array.isArray(rawType) ? rawType[0] : rawType;
  const required = REQUIRED_FIELDS[type];
  const errors   = [];
  const warnings = [];

  if (!type) return { type: "Unknown", errors: [{ path: "@type", message: "Missing @type", severity: "error" }], warnings, isValid: false };
  if (!required) return { type, errors, warnings: [{ path: "@type", message: `Type "${type}" not validated by this checker`, severity: "info" }], isValid: true };

  for (const field of required) {
    const val = item[field];
    if (val === undefined || val === null || (Array.isArray(val) && val.length === 0) || val === "") {
      errors.push({ path: field, message: `Missing required field: ${field}`, severity: "error" });
    }
  }

  // Type-specific deeper checks
  if (type === "Product") {
    if (!item.brand)   warnings.push({ path: "brand",   message: "Product ar trebui să aibă 'brand'",       severity: "warning" });
    if (!item.sku && !item.gtin && !item.mpn) warnings.push({ path: "sku/gtin/mpn", message: "Product ar trebui să aibă un identificator (sku/gtin/mpn)", severity: "warning" });
    const offers = item.offers;
    if (offers) {
      const offerArr = Array.isArray(offers) ? offers : [offers];
      for (const o of offerArr) {
        if (!o.priceCurrency) errors.push({ path: "offers.priceCurrency", message: "Missing priceCurrency on offer", severity: "error" });
        if (!o.price && !o.lowPrice) errors.push({ path: "offers.price", message: "Missing price on offer", severity: "error" });
      }
    } else {
      warnings.push({ path: "offers", message: "Product ar trebui să aibă offers pentru a fi eligibil pentru rich result", severity: "warning" });
    }
  }
  if (type === "Article" || type === "BlogPosting" || type === "NewsArticle") {
    if (typeof item.author === "string") warnings.push({ path: "author", message: "Author ar trebui să fie obiect {@type:Person, name:...} nu string", severity: "warning" });
    if (!item.image) warnings.push({ path: "image", message: "Article fără image nu e eligibil pentru rich result", severity: "warning" });
  }
  if (type === "FAQPage") {
    const me = item.mainEntity;
    if (!Array.isArray(me) || me.length < 2) warnings.push({ path: "mainEntity", message: "FAQPage ar trebui să aibă cel puțin 2 întrebări", severity: "warning" });
  }
  if (type === "BreadcrumbList") {
    const items = item.itemListElement;
    if (!Array.isArray(items) || items.length < 2) errors.push({ path: "itemListElement", message: "BreadcrumbList ar trebui să aibă cel puțin 2 elemente", severity: "error" });
  }

  return { type, errors, warnings, isValid: errors.length === 0 };
}

export async function validatePage(storeId, pageUrl) {
  const resp = await fetch(pageUrl, {
    headers: { "User-Agent": "Kimono-SchemaValidator/1.0 (+https://seo.kimonogroup.ro)" },
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`Fetch failed: HTTP ${resp.status}`);
  const html     = await resp.text();
  const schemas  = extractJsonLdFromHtml(html);
  const flat     = flattenSchemas(schemas);

  if (flat.length === 0) {
    // Record absent-schema result (no JSON-LD found on page)
    await prisma.seoSchemaValidation.upsert({
      where:  { storeId_pageUrlHash_schemaType: { storeId, pageUrlHash: sha1(pageUrl), schemaType: "None" } },
      create: {
        storeId, pageUrl, pageUrlHash: sha1(pageUrl), schemaType: "None",
        isValid: false,
        errors: [{ path: "document", message: "Nu am găsit blocuri JSON-LD pe pagină", severity: "warning" }],
        warnings: [], eligibleRichResults: [],
      },
      update: { lastCheckedAt: new Date(), isValid: false, errors: [{ path: "document", message: "Nu am găsit blocuri JSON-LD pe pagină", severity: "warning" }] },
    });
    return { pageUrl, schemas: [] };
  }

  const results = [];
  for (const item of flat) {
    const v = validateItem(item);
    const eligible = v.isValid ? (ELIGIBLE_RICH_RESULTS[v.type] || []) : [];

    await prisma.seoSchemaValidation.upsert({
      where:  { storeId_pageUrlHash_schemaType: { storeId, pageUrlHash: sha1(pageUrl), schemaType: v.type } },
      create: {
        storeId, pageUrl, pageUrlHash: sha1(pageUrl), schemaType: v.type,
        isValid: v.isValid,
        errors:   v.errors,
        warnings: v.warnings,
        eligibleRichResults: eligible,
      },
      update: {
        isValid: v.isValid,
        errors:   v.errors,
        warnings: v.warnings,
        eligibleRichResults: eligible,
        lastCheckedAt: new Date(),
      },
    });
    results.push({ type: v.type, isValid: v.isValid, errors: v.errors.length, warnings: v.warnings.length, eligible });
  }

  return { pageUrl, schemas: results };
}

export async function validateBatch(storeId, urls, concurrency = 3) {
  const results = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const chunk = urls.slice(i, i + concurrency);
    const part = await Promise.all(chunk.map(async u => {
      try { return await validatePage(storeId, u); }
      catch (e) { return { pageUrl: u, error: e.message }; }
    }));
    results.push(...part);
  }
  return results;
}

export async function sampleStoreUrls(storeId, shopDomain, accessToken, limit = 15) {
  // Fetch top products to validate
  const resp = await fetch(`https://${shopDomain}/admin/api/2025-04/graphql.json`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query: `query { products(first: ${limit}, query: "status:active", sortKey: UPDATED_AT, reverse: true) {
      edges { node { handle } }
    }}`}),
  });
  const data = await resp.json();
  const handles = data.data?.products?.edges?.map(e => e.node.handle) || [];
  const base = `https://${shopDomain.replace(".myshopify.com", "")}`; // fallback; may not match primary domain
  return handles.map(h => `https://${shopDomain}/products/${h}`);
}
