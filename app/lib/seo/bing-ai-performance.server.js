// app/lib/seo/bing-ai-performance.server.js
// Kimono SEO #31 — Bing AI Performance Integration
// API not yet available (Feb 2026 public preview, API on backlog)
// Module ready for when Microsoft releases API endpoints

import prisma from "../../db.server.js";

const BING_API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

// ─── Get Bing access token ────────────────────────────────────────────────────
async function getBingToken(storeId) {
  const tokenSetting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "bing_api_key" } },
  });
  if (!tokenSetting?.value) return null;
  return tokenSetting.value;
}

// ─── Fetch AI Performance data (when API becomes available) ──────────────────
async function fetchAiPerformance(apiKey, siteUrl) {
  // NOTE: As of Feb 2026, AI Performance data is NOT available via API
  // Microsoft has confirmed API is on backlog. These endpoints are planned:
  // - GET /GetAICitationSummary
  // - GET /GetAICitedPages
  // - GET /GetAIGroundingQueries

  // Try the standard Bing Webmaster API endpoints that DO exist
  const headers = { "Content-Type": "application/json" };

  // Site info (available now)
  try {
    const resp = await fetch(
      `${BING_API_BASE}/GetSiteInfo?apikey=${apiKey}&siteUrl=${encodeURIComponent(siteUrl)}`,
      { headers }
    );
    const data = await resp.json();
    if (data?.d) return { siteInfo: data.d, apiAvailable: true, aiDataAvailable: false };
  } catch {}

  return { apiAvailable: false, aiDataAvailable: false };
}

// ─── Fetch traffic stats (available in current API) ──────────────────────────
async function fetchTrafficStats(apiKey, siteUrl) {
  try {
    const resp = await fetch(
      `${BING_API_BASE}/GetRankAndTrafficStats?apikey=${apiKey}&siteUrl=${encodeURIComponent(siteUrl)}`,
      { headers: { "Content-Type": "application/json" } }
    );
    const data = await resp.json();
    return data?.d || null;
  } catch { return null; }
}

// ─── Fetch crawl stats ────────────────────────────────────────────────────────
async function fetchCrawlStats(apiKey, siteUrl) {
  try {
    const resp = await fetch(
      `${BING_API_BASE}/GetCrawlStats?apikey=${apiKey}&siteUrl=${encodeURIComponent(siteUrl)}`,
      { headers: { "Content-Type": "application/json" } }
    );
    const data = await resp.json();
    return data?.d || null;
  } catch { return null; }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export async function runBingAiPerformance(storeId) {
  const apiKey = await getBingToken(storeId);
  if (!apiKey) throw new Error("Bing API key not configured");

  const siteUrlSetting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "bing_site_url" } },
  });
  const siteUrl = siteUrlSetting?.value;
  if (!siteUrl) throw new Error("Bing site URL not configured");

  console.log(`[Bing AI] Fetching data for ${siteUrl}`);

  const [aiPerf, traffic, crawl] = await Promise.all([
    fetchAiPerformance(apiKey, siteUrl),
    fetchTrafficStats(apiKey, siteUrl),
    fetchCrawlStats(apiKey, siteUrl),
  ]);

  const result = {
    siteUrl,
    apiConnected:    aiPerf.apiAvailable,
    aiDataAvailable: aiPerf.aiDataAvailable,
    siteInfo:        aiPerf.siteInfo || null,
    traffic:         traffic,
    crawl:           crawl,
    // AI Performance fields (null until API available)
    totalCitations:   null,
    avgCitedPages:    null,
    groundingQueries: [],
    citedPages:       [],
    note: "AI Performance API not yet available. Microsoft has confirmed it is on their backlog. Connect your Bing Webmaster API key to access available crawl and traffic data now.",
    fetchedAt: new Date().toISOString(),
  };

  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: "bing_ai_results" } },
    create: { storeId, key: "bing_ai_results", value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });

  console.log(`[Bing AI] Done — connected: ${aiPerf.apiAvailable}, AI data: ${aiPerf.aiDataAvailable}`);
  return result;
}

export async function saveBingSettings(storeId, apiKey, siteUrl) {
  await Promise.all([
    prisma.seoSetting.upsert({
      where:  { storeId_key: { storeId, key: "bing_api_key" } },
      create: { storeId, key: "bing_api_key", value: apiKey },
      update: { value: apiKey },
    }),
    prisma.seoSetting.upsert({
      where:  { storeId_key: { storeId, key: "bing_site_url" } },
      create: { storeId, key: "bing_site_url", value: siteUrl },
      update: { value: siteUrl },
    }),
  ]);
}

export async function getBingAiResults(storeId) {
  const [saved, apiKeySetting, siteUrlSetting] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "bing_ai_results" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "bing_api_key" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "bing_site_url" } } }),
  ]);

  return {
    data:     saved?.value ? JSON.parse(saved.value) : null,
    apiKey:   apiKeySetting?.value || "",
    siteUrl:  siteUrlSetting?.value || "",
    connected: !!apiKeySetting?.value,
  };
}
