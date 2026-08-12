// app/lib/seo/entity-seo.server.js
// Kimono SEO M14 — Entity SEO: identify entities, check consistency, generate Organization schema (sameAs)

import prisma from "../../db.server.js";

const CLAUDE_MODEL = "claude-sonnet-4-5";
const CLAUDE_URL   = "https://api.anthropic.com/v1/messages";

async function callClaude(systemPrompt, userMessage, maxTokens = 3500) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const resp = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      CLAUDE_MODEL,
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userMessage }],
    }),
  });
  if (!resp.ok) throw new Error(`Claude ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.content?.[0]?.text || "";
}

function extractJson(text) {
  const m = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
  if (!m) throw new Error("No JSON in Claude response");
  return JSON.parse(m[1]);
}

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
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true, shopName: true } });
  if (!store) throw new Error("Store not found");
  const conn = await prisma.storeConnection.findFirst({
    where: { shopDomain: store.shopDomain, isActive: true, platform: "SHOPIFY" },
    orderBy: { connectedAt: "desc" },
  });
  if (!conn?.accessToken) throw new Error("No active Shopify connection");
  return { store, conn };
}

async function collectStoreData(shopDomain, accessToken) {
  const productsQuery = `
    query { products(first: 40, sortKey: UPDATED_AT, reverse: true) {
      edges { node { title vendor productType tags } }
    }}`;
  const productsData = await shopifyGraphQL(shopDomain, accessToken, productsQuery);
  const products = productsData.products.edges.map(e => e.node);

  let articles = [];
  try {
    const articlesQuery = `query { articles(first: 20, sortKey: PUBLISHED_AT, reverse: true) {
      edges { node { title tags author { name } } }
    }}`;
    const articlesData = await shopifyGraphQL(shopDomain, accessToken, articlesQuery);
    articles = articlesData.articles.edges.map(e => e.node);
  } catch { /* articles unavailable */ }

  const shopQuery = `query { shop { name description url contactEmail } }`;
  const shopData  = await shopifyGraphQL(shopDomain, accessToken, shopQuery);

  return { products, articles, shop: shopData.shop };
}

export async function runEntityAudit(storeId) {
  const { store, conn } = await getConnection(storeId);
  const { products, articles, shop } = await collectStoreData(store.shopDomain, conn.accessToken);

  const payload = {
    shop: { name: shop.name, description: shop.description, url: shop.url, email: shop.contactEmail },
    productSamples: products.map(p => ({ title: p.title, vendor: p.vendor, productType: p.productType, tags: p.tags })),
    articleSamples: articles.map(a => ({ title: a.title, author: a.author?.name, tags: a.tags })),
  };

  const system = `Ești expert SEO pentru Entity SEO și Knowledge Graph. Analizezi catalogul unui magazin Shopify și identifici entitățile principale (branduri, tipuri de produse, persoane, locuri). Verifici consistența numelor și propui Organization JSON-LD cu sameAs pentru social profiles. Nu inventa URL-uri; include sameAs doar dacă ai indicii clare în date.`;

  const userMsg = `Date magazin:
${JSON.stringify(payload, null, 2)}

Returnează JSON în format exact:
\`\`\`json
{
  "entities": [
    { "name": "string", "type": "Brand|ProductType|Person|Place|Category", "frequency": number, "sources": ["products","articles","about"] }
  ],
  "consistencyScore": number (0-100),
  "issues": [
    { "entity": "string", "issue": "string scurt", "recommendation": "string scurt, acționabil" }
  ],
  "organizationJson": {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "string",
    "url": "string",
    "logo": "string opțional",
    "description": "string",
    "sameAs": ["url-uri plauzibile pentru social profiles sau alte brand URL-uri"]
  }
}
\`\`\`

Analizează cel puțin 8 entități distincte dacă există în date. ConsistencyScore reflectă cât de consistent sunt folosite denumirile (brand name, categorii).`;

  const raw    = await callClaude(system, userMsg, 3500);
  const result = extractJson(raw);

  return prisma.seoEntityAudit.upsert({
    where:  { storeId },
    create: {
      storeId,
      entities:         result.entities         || [],
      organizationJson: JSON.stringify(result.organizationJson || {}, null, 2),
      consistencyScore: result.consistencyScore ?? 0,
      issues:           result.issues           || [],
      lastAuditedAt:    new Date(),
    },
    update: {
      entities:         result.entities         || [],
      organizationJson: JSON.stringify(result.organizationJson || {}, null, 2),
      consistencyScore: result.consistencyScore ?? 0,
      issues:           result.issues           || [],
      lastAuditedAt:    new Date(),
      appliedToTheme:   false,
      appliedAt:        null,
    },
  });
}

export async function applyEntityToTheme(storeId) {
  const audit = await prisma.seoEntityAudit.findUnique({ where: { storeId } });
  if (!audit?.organizationJson) throw new Error("No organization JSON to apply. Rulează auditul întâi.");

  const { store, conn } = await getConnection(storeId);

  const shopIdData = await shopifyGraphQL(store.shopDomain, conn.accessToken, `{ shop { id } }`);
  const shopId     = shopIdData.shop.id;

  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key namespace value }
        userErrors { field message }
      }
    }`;
  const variables = {
    metafields: [{
      ownerId:   shopId,
      namespace: "openclaw",
      key:       "organization_schema",
      type:      "json",
      value:     audit.organizationJson,
    }],
  };

  const res = await shopifyGraphQL(store.shopDomain, conn.accessToken, mutation, variables);
  const errs = res.metafieldsSet?.userErrors || [];
  if (errs.length) throw new Error(errs.map(e => e.message).join("; "));

  return prisma.seoEntityAudit.update({
    where: { storeId },
    data:  { appliedToTheme: true, appliedAt: new Date() },
  });
}

export async function getEntityAudit(storeId) {
  return prisma.seoEntityAudit.findUnique({ where: { storeId } });
}
