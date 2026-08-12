// app/lib/seo/llm-sentiment.server.js
// Kimono SEO #32 — LLM Sentiment Analysis
// Uses DataForSEO AI Optimization API — LLM Mentions
// Checks if brand/domain is mentioned by ChatGPT, Claude, Perplexity, Gemini

import prisma from "../../db.server.js";

function getDfsAuth() {
  const login    = process.env.DATAFORSEO_LOGIN    || "";
  const password = process.env.DATAFORSEO_PASSWORD || "";
  if (!login || !password) return null;
  return Buffer.from(`${login}:${password}`).toString("base64");
}

async function dfsFetch(endpoint, body) {
  const auth = getDfsAuth();
  if (!auth) throw new Error("DataForSEO not configured");
  const resp = await fetch(`https://api.dataforseo.com${endpoint}`, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (data.status_code !== 20000) throw new Error(`DataForSEO error: ${data.status_message}`);
  return data;
}

// ─── Fetch LLM Mentions for a domain ────────────────────────────────────────
export async function fetchLlmMentions(domain, brandName) {
  // Search by domain
  const searchData = await dfsFetch("/v3/ai_optimization/llm_mentions/search/live", [{
    target: domain,
    limit: 100,
  }]);

  const rawResult = searchData.tasks?.[0]?.result?.[0];
  console.log("[LLM Sentiment] Raw result keys:", Object.keys(rawResult || {}));
  console.log("[LLM Sentiment] Status:", searchData.tasks?.[0]?.status_message);
  console.log("[LLM Sentiment] Result count:", searchData.tasks?.[0]?.result_count);
  if (rawResult) console.log("[LLM Sentiment] Sample result:", JSON.stringify(rawResult).slice(0, 500));
  const items = rawResult?.items || [];

  // Also fetch aggregated metrics
  let aggregated = null;
  try {
    const aggData = await dfsFetch("/v3/ai_optimization/llm_mentions/aggregated_metrics/live", [{
      target: domain,
    }]);
    aggregated = aggData.tasks?.[0]?.result?.[0];
  } catch {}

  // Fetch top pages
  let topPages = [];
  try {
    const pagesData = await dfsFetch("/v3/ai_optimization/llm_mentions/top_pages/live", [{
      target: domain,
      limit: 10,
    }]);
    topPages = pagesData.tasks?.[0]?.result?.[0]?.items || [];
  } catch {}

  // Parse mentions by AI platform
  const byPlatform = {};
  const mentions = [];

  for (const item of items) {
    const platform = item.se_type || item.platform || "unknown";
    if (!byPlatform[platform]) byPlatform[platform] = 0;
    byPlatform[platform]++;

    mentions.push({
      platform,
      query:     item.keyword || item.query || "",
      url:       item.url || "",
      title:     item.title || "",
      context:   item.description || item.snippet || "",
      sentiment: item.sentiment || "neutral",
      date:      item.last_seen || null,
    });
  }

  // Sentiment breakdown
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  for (const m of mentions) {
    sentimentCounts[m.sentiment] = (sentimentCounts[m.sentiment] || 0) + 1;
  }

  const totalMentions = mentions.length;
  const overallSentiment = totalMentions === 0 ? "no_data"
    : sentimentCounts.positive > sentimentCounts.negative ? "positive"
    : sentimentCounts.negative > sentimentCounts.positive ? "negative"
    : "neutral";

  return {
    domain,
    brandName,
    totalMentions,
    byPlatform,
    sentimentCounts,
    overallSentiment,
    mentions: mentions.slice(0, 50),
    topPages: topPages.slice(0, 10),
    aggregated,
    scannedAt: new Date().toISOString(),
  };
}

// ─── Main: run full LLM sentiment analysis ───────────────────────────────────
export async function runLlmSentimentAnalysis(storeId, shopDomain) {
  console.log(`[LLM Sentiment] Starting for ${shopDomain}`);

  // Get brand name from settings or derive from domain
  const brandSetting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "brand_name" } },
  });
  const brandName = brandSetting?.value || shopDomain.replace(".myshopify.com", "").replace(/-/g, " ");

  // Get domain from GSC settings or derive from shopDomain
  const gscSiteSetting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "seo_gsc_site_url" } },
  });
  const domain = gscSiteSetting?.value
    ? gscSiteSetting.value.replace(/https?:\/\//, "").replace(/\/$/, "")
    : shopDomain.replace(".myshopify.com", "") + ".ro";

  const result = await fetchLlmMentions(domain, brandName);

  // Save to DB
  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: "llm_sentiment_results" } },
    create: { storeId, key: "llm_sentiment_results", value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });

  console.log(`[LLM Sentiment] Done — ${result.totalMentions} mentions found`);
  return result;
}

// ─── Get saved results ────────────────────────────────────────────────────────
export async function getLlmSentimentResults(storeId) {
  const setting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "llm_sentiment_results" } },
  });
  if (!setting?.value) return null;
  try { return JSON.parse(setting.value); } catch { return null; }
}
