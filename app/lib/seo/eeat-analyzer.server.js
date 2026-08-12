// app/lib/seo/eeat-analyzer.server.js
// Kimono SEO M15 — E-E-A-T Analyzer (Experience, Expertise, Authoritativeness, Trustworthiness)

import prisma from "../../db.server.js";

const CLAUDE_MODEL = "claude-sonnet-4-5";

async function callClaude(systemPrompt, userMsg, maxTokens = 3000) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: "user", content: userMsg }] }),
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
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query, variables }),
  });
  const data = await resp.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

async function fetchPageText(url, timeout = 8000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const resp = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "Kimono-EEAT/1.0" } });
    clearTimeout(timer);
    if (!resp.ok) return "";
    const html = await resp.text();
    return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
  } catch { return ""; }
}

export async function runEEATAudit(storeId) {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true, shopName: true } });
  if (!store) throw new Error("Store not found");

  const conn = await prisma.storeConnection.findFirst({
    where: { shopDomain: store.shopDomain, isActive: true, platform: "SHOPIFY" },
    orderBy: { connectedAt: "desc" },
  });
  if (!conn?.accessToken) throw new Error("No active Shopify connection");

  // Collect site data
  const shopQuery = `query { shop { name description url contactEmail primaryDomain { url } } }`;
  const shopData  = await shopifyGraphQL(store.shopDomain, conn.accessToken, shopQuery);
  const shop = shopData.shop;
  const siteUrl = shop.primaryDomain?.url || shop.url || `https://${store.shopDomain}`;

  // Fetch key pages
  const [homeText, aboutText, contactText] = await Promise.all([
    fetchPageText(siteUrl),
    fetchPageText(`${siteUrl}/pages/about-us`).then(t => t || fetchPageText(`${siteUrl}/pages/despre-noi`)),
    fetchPageText(`${siteUrl}/pages/contact`),
  ]);

  // Check a few product pages
  const productsData = await shopifyGraphQL(store.shopDomain, conn.accessToken, `query { products(first: 5, sortKey: UPDATED_AT, reverse: true) { edges { node { title handle descriptionHtml } } } }`);
  const productSamples = productsData.products.edges.map(e => ({
    title: e.node.title,
    descLen: (e.node.descriptionHtml || "").length,
  }));

  // Check articles
  let articleSamples = [];
  try {
    const articlesData = await shopifyGraphQL(store.shopDomain, conn.accessToken, `query { articles(first: 5, sortKey: PUBLISHED_AT, reverse: true) { edges { node { title author { name } publishedAt contentHtml } } } }`);
    articleSamples = articlesData.articles.edges.map(e => ({
      title: e.node.title,
      author: e.node.author?.name,
      publishedAt: e.node.publishedAt,
      contentLen: (e.node.contentHtml || "").length,
    }));
  } catch {}

  const payload = {
    shop: { name: shop.name, description: shop.description, url: siteUrl, hasContactEmail: !!shop.contactEmail },
    homePreview:   homeText.slice(0, 1500),
    aboutPreview:  aboutText.slice(0, 1500) || "[nu s-a găsit pagina about/despre-noi]",
    contactPreview: contactText.slice(0, 800) || "[nu s-a găsit pagina contact]",
    productSamples,
    articleSamples,
  };

  const system = `Ești auditor SEO specializat în E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) conform Google Quality Rater Guidelines. Evaluezi strict pe 16 puncte și returnezi JSON cu scoruri 0-100 per categorie.`;

  const userMsg = `Date magazin:
${JSON.stringify(payload, null, 2)}

Evaluează pe 16 puncte (4 per categorie E-E-A-T):

EXPERIENCE (first-hand):
1. Descrieri produse menționează utilizare reală / testing
2. Articole cu "personal experience" / "am folosit" / "am testat"
3. Imagini/video proprii, nu doar stock
4. Recenzii sau testimoniale de utilizatori

EXPERTISE (cunoaștere specializată):
5. Author bylines cu credențiale pe articole
6. Pagina "About" explică cine e echipa / fondator
7. Taxonomie produse reflectă cunoaștere a domeniului
8. Copy produs conține detalii tehnice specifice, nu generic

AUTHORITATIVENESS (recunoaștere externă):
9. Brand name menționat consistent pe site
10. Menționări de premii, parteneriate, certificări
11. Logo/favicon profesional prezent
12. Pagini informaționale dedicate (ghiduri, FAQ)

TRUSTWORTHINESS (încredere):
13. Contact clar (email, telefon, adresă)
14. Pagini Terms / Privacy Policy / Returns
15. Trust badges, SSL, plăți securizate menționate
16. Recenzii verificabile sau linkuri către profiles

Returnează JSON:
\`\`\`json
{
  "experienceScore":        <0-100>,
  "expertiseScore":         <0-100>,
  "authoritativenessScore": <0-100>,
  "trustworthinessScore":   <0-100>,
  "overallScore":           <medie ponderată, 0-100>,
  "findings": [
    { "category": "E|Ex|A|T", "point": "string scurt", "status": "pass|warn|fail", "note": "observație concretă" }
    // minim 16 findings, câte 4 per categorie
  ],
  "plan": [
    { "action": "text concret, acționabil", "priority": "high|med|low", "estimatedImpact": "text scurt" }
    // 5-10 acțiuni, priority high primele
  ]
}
\`\`\``;

  const raw    = await callClaude(system, userMsg, 3500);
  const result = extractJson(raw);

  return prisma.seoEEATAudit.create({
    data: {
      storeId,
      experienceScore:        result.experienceScore        ?? 0,
      expertiseScore:         result.expertiseScore         ?? 0,
      authoritativenessScore: result.authoritativenessScore ?? 0,
      trustworthinessScore:   result.trustworthinessScore   ?? 0,
      overallScore:           result.overallScore           ?? 0,
      findings:               result.findings               || [],
      plan:                   result.plan                   || [],
    },
  });
}

export async function getLatestEEAT(storeId) {
  return prisma.seoEEATAudit.findFirst({
    where:   { storeId },
    orderBy: { runAt: "desc" },
  });
}
