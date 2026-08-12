// app/lib/seo/image-vision.server.js
// Kimono SEO M03 — Image Vision: Claude Vision → alt text SEO + filename suggestion

import prisma from "../../db.server.js";

const CLAUDE_MODEL = "claude-sonnet-4-5";

async function shopifyGraphQL(shopDomain, accessToken, query, variables = {}) {
  const resp = await fetch(`https://${shopDomain}/admin/api/2025-04/graphql.json`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body:    JSON.stringify({ query, variables }),
  });
  const data = await resp.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

async function getConnection(storeId) {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true } });
  if (!store) throw new Error("Store not found");
  const conn = await prisma.storeConnection.findFirst({
    where: { shopDomain: store.shopDomain, isActive: true, platform: "SHOPIFY" },
    orderBy: { connectedAt: "desc" },
  });
  if (!conn?.accessToken) throw new Error("No active Shopify connection");
  return { store, conn };
}

async function callClaudeVision(imageUrl, contextPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error(`Failed to fetch image: ${imgResp.status}`);
  const rawType = imgResp.headers.get("content-type") || "image/jpeg";
  const mimeType = rawType.split(";")[0].trim();
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const mt = allowed.includes(mimeType) ? mimeType : "image/jpeg";

  const buffer = Buffer.from(await imgResp.arrayBuffer());
  if (buffer.length > 5 * 1024 * 1024) throw new Error("Image > 5MB — skip");
  const base64 = buffer.toString("base64");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      CLAUDE_MODEL,
      max_tokens: 300,
      system:     "Ești expert SEO pentru alt text. Generezi descrieri scurte (6-14 cuvinte) care includ natural cuvinte-cheie SEO relevante pentru produs. Răspunzi DOAR cu alt text-ul, fără ghilimele, fără preambul.",
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mt, data: base64 } },
          { type: "text",  text: contextPrompt },
        ],
      }],
    }),
  });
  if (!resp.ok) throw new Error(`Claude Vision ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return (data.content?.[0]?.text || "").trim();
}

// Scan ALL products (cursor pagination) and populate SeoImageAlt rows for images missing alt text
export async function scanImagesWithoutAlt(storeId, limit = 99999) {
  const { store, conn } = await getConnection(storeId);
  
  let allProducts = [];
  let cursor = null;
  let hasNext = true;
  const batchSize = 250; // Shopify max per query
  
  while (hasNext && allProducts.length < limit) {
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const query = `
      query {
        products(first: ${batchSize}${afterClause}, query: "status:active", sortKey: UPDATED_AT, reverse: true) {
          pageInfo { hasNextPage }
          edges { 
            cursor
            node {
              id title handle
              images(first: 6) { edges { node { id url altText } } }
            } 
          }
        }
      }`;
    const data = await shopifyGraphQL(store.shopDomain, conn.accessToken, query);
    const edges = data.products.edges;
    const products = edges.map(e => e.node);
    allProducts.push(...products);
    hasNext = data.products.pageInfo.hasNextPage && edges.length > 0;
    if (edges.length > 0) cursor = edges[edges.length - 1].cursor;
  }

  const rows = [];
  for (const p of allProducts) {
    const images = p.images.edges.map(e => e.node);
    images.forEach((img, idx) => {
      if (!img.altText || img.altText.trim().length === 0) {
        rows.push({
          productId: p.id,
          productTitle: p.title,
          imageId: img.id,
          imageUrl: img.url,
          imagePosition: idx,
          originalAlt: img.altText || "",
        });
      }
    });
  }

  for (const row of rows) {
    await prisma.seoImageAlt.upsert({
      where: { storeId_imageId: { storeId, imageId: row.imageId } },
      create: { storeId, ...row, status: "pending" },
      update: { originalAlt: row.originalAlt, productTitle: row.productTitle, imageUrl: row.imageUrl },
    });
  }

  return { found: rows.length, productsScanned: allProducts.length };
}

export async function generateAltText(storeId, imageAltId) {
  const row = await prisma.seoImageAlt.findUnique({ where: { id: imageAltId } });
  if (!row || row.storeId !== storeId) throw new Error("Row not found");

  const contextPrompt = `Produs: "${row.productTitle}". Limba: română. Generează alt text descriptiv, 6-14 cuvinte, care include natural cuvinte relevante pentru produs. Răspunzi DOAR cu alt text-ul.`;

  try {
    let altText = await callClaudeVision(row.imageUrl, contextPrompt);
    altText = altText.replace(/^["']|["']$/g, "").trim();
    if (altText.length > 200) altText = altText.slice(0, 197) + "...";

    const filenameSlug = row.productTitle
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    const ext = row.imageUrl.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[1]?.toLowerCase() || "jpg";
    const filename = `${filenameSlug}-${row.imagePosition + 1}.${ext}`;

    return prisma.seoImageAlt.update({
      where: { id: imageAltId },
      data:  {
        suggestedAlt:      altText,
        suggestedFilename: filename,
        status:            "approved",
        errorMessage:      null,
      },
    });
  } catch (e) {
    return prisma.seoImageAlt.update({
      where: { id: imageAltId },
      data:  { status: "error", errorMessage: e.message.slice(0, 300) },
    });
  }
}

export async function generateAltTextBatch(storeId, ids) {
  const results = { ok: 0, failed: 0 };
  for (const id of ids) {
    try { await generateAltText(storeId, id); results.ok++; }
    catch { results.failed++; }
    await new Promise(r => setTimeout(r, 500)); // rate-limit soft
  }
  return results;
}

export async function applyAltText(storeId, imageAltId) {
  const row = await prisma.seoImageAlt.findUnique({ where: { id: imageAltId } });
  if (!row || row.storeId !== storeId) throw new Error("Row not found");
  if (!row.suggestedAlt) throw new Error("Nu există alt text generat. Rulează 'Generate' întâi.");

  const { store, conn } = await getConnection(storeId);

  const mutation = `
    mutation productImageUpdate($productId: ID!, $image: ImageInput!) {
      productImageUpdate(productId: $productId, image: $image) {
        image { id altText }
        userErrors { field message }
      }
    }`;
  const res = await shopifyGraphQL(store.shopDomain, conn.accessToken, mutation, {
    productId: row.productId,
    image:     { id: row.imageId, altText: row.suggestedAlt },
  });
  const errs = res.productImageUpdate?.userErrors || [];
  if (errs.length) throw new Error(errs.map(e => e.message).join("; "));

  return prisma.seoImageAlt.update({
    where: { id: imageAltId },
    data:  { status: "applied", appliedAt: new Date() },
  });
}

export async function applyAltTextBatch(storeId, ids) {
  const results = { ok: 0, failed: 0, errors: [] };
  for (const id of ids) {
    try { await applyAltText(storeId, id); results.ok++; }
    catch (e) { results.failed++; results.errors.push(e.message); }
  }
  return results;
}

export async function rejectAlt(storeId, imageAltId) {
  return prisma.seoImageAlt.update({
    where: { id: imageAltId },
    data:  { status: "rejected" },
  });
}
