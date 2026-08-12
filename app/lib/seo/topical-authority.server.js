// app/lib/seo/topical-authority.server.js
// Kimono SEO M17 — Topical Authority: own topics vs competitor gaps, editorial plan

import prisma from "../../db.server.js";

const CLAUDE_MODEL = "claude-sonnet-4-5";

function dfsAuth() {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return Buffer.from(`${login}:${password}`).toString("base64");
}

async function dfsFetch(endpoint, body) {
  const auth = dfsAuth();
  if (!auth) throw new Error("DataForSEO not configured");
  const resp = await fetch(`https://api.dataforseo.com${endpoint}`, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (data.status_code !== 20000) throw new Error(`DFS: ${data.status_message}`);
  return data;
}

async function callClaude(system, userMsg, maxTokens = 3500) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: userMsg }] }),
  });
  if (!resp.ok) throw new Error(`Claude ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.content?.[0]?.text || "";
}

function extractJson(text) {
  const m = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
  if (!m) throw new Error("No JSON in response");
  return JSON.parse(m[1]);
}

async function fetchRankedKeywords(domain, locationCode = 2642, limit = 100) {
  const data = await dfsFetch("/v3/dataforseo_labs/google/ranked_keywords/live", [{
    target: domain,
    location_code: locationCode,
    language_code: "ro",
    limit,
    filters: [["keyword_data.keyword_info.search_volume", ">", 10], "and", ["ranked_serp_element.serp_item.rank_absolute", "<=", 50]],
  }]);
  const items = data.tasks?.[0]?.result?.[0]?.items || [];
  return items.map(it => ({
    keyword: it.keyword_data?.keyword,
    volume: it.keyword_data?.keyword_info?.search_volume ?? 0,
    position: it.ranked_serp_element?.serp_item?.rank_absolute ?? 99,
  }));
}

export async function runTopicalAudit(storeId, competitors = []) {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true } });
  if (!store) throw new Error("Store not found");

  // Our domain: strip .myshopify.com or use primaryDomain
  const ownDomain = store.shopDomain.replace(".myshopify.com", ".ro") || store.shopDomain;

  // Get own keywords from DB (from Keywords module)
  const ownKeywords = await prisma.seoKeyword.findMany({
    where:   { storeId },
    select:  { keyword: true, volume: true },
    orderBy: { volume: "desc" },
    take:    200,
  });

  // Get competitor ranked keywords (limit 2 competitors to save DFS credits)
  const compKeywords = {};
  for (const comp of competitors.slice(0, 2)) {
    try {
      compKeywords[comp] = await fetchRankedKeywords(comp, 2642, 80);
    } catch (e) {
      console.warn(`[TopicalAuth] Failed fetching ${comp}:`, e.message);
      compKeywords[comp] = [];
    }
  }

  const payload = {
    ownDomain,
    ownKeywordSample: ownKeywords.slice(0, 100).map(k => ({ k: k.keyword, v: k.volume })),
    competitors: Object.entries(compKeywords).map(([domain, kws]) => ({
      domain,
      sample: kws.slice(0, 50).map(k => ({ k: k.keyword, v: k.volume, p: k.position })),
    })),
  };

  const system = `Ești strateg SEO pentru topical authority. Analizezi keywords proprii și ale competitorilor, identifici topice și gap-uri, propui plan editorial pe 3/6/12 luni.`;

  const userMsg = `Date:
${JSON.stringify(payload, null, 2)}

1. Grupează keywords în TOPICE (10-20 topice, ex: "tratamente tenoane", "scule atelier", "accesorii camping", etc.)
2. Pentru fiecare topic evaluează:
   - ownKwCount = câte keywords avem noi pe acel topic
   - ownAvgVol = volumul mediu
   - competitorKwCount = câte keywords au competitorii pe acel topic
   - gapScore (0-100): 100 = nu acoperim deloc un topic pe care competitorii îl domină; 0 = paritate sau superioritate
3. Identifică TOP 5-8 GAPS cu cea mai mare oportunitate
4. Propune plan editorial 12 luni (lunile 1-12 cu 2-4 articole fiecare, tip pillar/satellite)

Returnează JSON:
\`\`\`json
{
  "topics": [
    { "topic": "string", "ownKwCount": N, "ownAvgVol": N, "competitorKwCount": N, "gapScore": 0-100 }
  ],
  "gaps": [
    { "topic": "string", "opportunity": "descriere scurtă", "priority": "high|med|low", "estimatedKeywords": N, "estimatedVolume": N }
  ],
  "editorialPlan": [
    { "month": 1, "articles": [ { "title": "string", "keywords": ["kw1","kw2"], "priority": "high|med|low", "type": "pillar|satellite" } ] },
    { "month": 2, "articles": [...] }
    // ... până la 12
  ]
}
\`\`\``;

  const raw    = await callClaude(system, userMsg, 4000);
  const result = extractJson(raw);

  return prisma.seoTopicalMap.create({
    data: {
      storeId,
      topics:        result.topics        || [],
      gaps:          result.gaps          || [],
      editorialPlan: result.editorialPlan || [],
      competitors,
    },
  });
}

export async function getLatestMap(storeId) {
  return prisma.seoTopicalMap.findFirst({
    where:   { storeId },
    orderBy: { runAt: "desc" },
  });
}
