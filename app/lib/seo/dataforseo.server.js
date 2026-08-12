// app/lib/seo/dataforseo.server.js
// ═══ Kimono SEO — DataForSEO Integration v2 ═══
// Credentials: ENV (DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD)
// All calls go through dfs-cache.server.js for 30-day TTL caching.

import { DFS_LANGUAGE_CODES, DFS_LOCATION_CODES, KW_TYPE_PATTERNS } from "./constants.js";
import { getBulkCached, setBulkCached, getCached, setCached, normalizeKeyword } from "./dfs-cache.server.js";

// ─── AUTH ───
function dfsAuth() {
  const login    = process.env.DATAFORSEO_LOGIN    || "";
  const password = process.env.DATAFORSEO_PASSWORD || "";
  if (!login || !password) throw new Error("DataForSEO credentials not configured in ENV.");
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

export function hasDfsConfig() {
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

// ─── SCORING ───
// Score = (volume * 0.4) + (commerciality * 0.3) + (difficulty_inverse * 0.2) + (serp_bonus * 0.1)
export function scoreKeyword({ volume, difficulty, cpc, serpFeatures, paaCount }) {
  const vol      = Math.min(volume || 0, 100000);
  const volScore = vol / 100000;

  const commercial =
    (cpc > 0 ? 0.5 : 0) +
    ((serpFeatures || []).includes("shopping") ? 0.3 : 0) +
    (paaCount > 3 ? 0.2 : 0);

  const diffInverse = difficulty > 0 ? (100 - Math.min(difficulty, 100)) / 100 : 0.5;

  const serpBonus =
    ((serpFeatures || []).includes("shopping")         ? 0.5 : 0) +
    ((serpFeatures || []).includes("featured_snippet") ? 0.3 : 0) +
    ((serpFeatures || []).includes("people_also_ask")  ? 0.2 : 0);

  return (
    volScore   * 0.4 +
    commercial * 0.3 +
    diffInverse * 0.2 +
    Math.min(serpBonus, 1) * 0.1
  );
}

// ─── BULK VOLUME ENRICHMENT ───
/**
 * Enrich a list of keywords with volume + CPC.
 * Uses cache — only calls DFS for misses.
 *
 * @param {string[]} keywords
 * @param {string} langCode
 * @returns {Map<string, {volume, difficulty, cpc, competition, serpFeatures, paaCount, trend, score}>}
 */
export async function enrichKeywords(keywords, langCode = "ro") {
  if (!keywords.length) return new Map();

  const { hits, misses } = await getBulkCached(keywords, langCode);

  if (misses.length > 0) {
    const fresh = await fetchVolumeFromDfs(misses, langCode);
    await setBulkCached(fresh, langCode);
    for (const item of fresh) {
      hits.set(normalizeKeyword(item.keyword), item);
    }
  }

  const result = new Map();
  for (const [kw, data] of hits) {
    result.set(kw, { ...data, score: scoreKeyword(data) });
  }
  return result;
}

async function fetchVolumeFromDfs(keywords, langCode = "ro") {
  const language = DFS_LANGUAGE_CODES[langCode] || DFS_LANGUAGE_CODES["ro"];
  const location = DFS_LOCATION_CODES[langCode] || 2642;
  const chunks   = chunkArray(keywords, 1000);
  const results  = [];

  for (const chunk of chunks) {
    const resp = await fetch(
      "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live",
      {
        method:  "POST",
        headers: { Authorization: dfsAuth(), "Content-Type": "application/json" },
        body:    JSON.stringify([{ language_name: language.name, location_code: location, keywords: chunk }]),
      }
    );
    if (!resp.ok) { console.error(`[DFS] volume API ${resp.status}`); continue; }
    const data = await resp.json();
    if (data.status_code !== 20000) continue;

    for (const task of data.tasks || []) {
      if (task.status_code !== 20000) continue;
      for (const r of task.result || []) {
        const compIndex   = r.competition_index || 0;
        const competition = compIndex >= 66 ? "HIGH" : compIndex >= 33 ? "MEDIUM" : "LOW";
        const trend       = (r.monthly_searches || []).map((m) => m.search_volume || 0).slice(0, 12);
        results.push({
          keyword: r.keyword || "", volume: r.search_volume || 0, difficulty: 0,
          cpc: r.cpc || 0, competition, serpFeatures: [], paaCount: 0, trend,
        });
      }
    }
  }
  return results;
}

// ─── KEYWORD IDEAS ───
/**
 * Get keyword suggestions for a seed keyword.
 *
 * @param {string} seedKeyword
 * @param {string} langCode
 * @param {number} limit
 * @returns {Array<{keyword, volume, cpc, competition, score, type}>}
 */
export async function fetchKeywordIdeas(seedKeyword, langCode = "ro", limit = 30) {
  const keyword  = seedKeyword.replace(/-/g, " ");
  const language = DFS_LANGUAGE_CODES[langCode] || DFS_LANGUAGE_CODES["ro"];
  const location = DFS_LOCATION_CODES[langCode] || 2642;

  const resp = await fetch(
    "https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live",
    {
      method:  "POST",
      headers: { Authorization: dfsAuth(), "Content-Type": "application/json" },
      body:    JSON.stringify([{ language_name: language.name, location_code: location, keywords: [keyword], limit }]),
    }
  );
  if (!resp.ok) { const err = await resp.text(); throw new Error(`DFS Ideas ${resp.status}: ${err}`); }

  const data = await resp.json();
  if (data.status_code !== 20000) throw new Error(`DFS: ${data.status_message}`);
  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) throw new Error(`DFS task: ${task?.status_message}`);

  const keywords = [];
  for (const r of task.result || []) {
    const kw = r.keyword || "";
    if (!kw) continue;
    const compIndex   = r.competition_index || 0;
    const competition = compIndex >= 66 ? "HIGH" : compIndex >= 33 ? "MEDIUM" : "LOW";
    const trend       = (r.monthly_searches || []).map((m) => m.search_volume || 0).slice(0, 12);
    const kwLower     = kw.toLowerCase();
    let kwType = "transactional";
    if (KW_TYPE_PATTERNS.informational.test(kwLower)) kwType = "informational";
    else if (KW_TYPE_PATTERNS.comparative.test(kwLower)) kwType = "comparative";

    const item = { keyword: kw, volume: r.search_volume || 0, difficulty: 0, cpc: r.cpc || 0, competition, serpFeatures: [], paaCount: 0, trend, type: kwType };
    item.score = scoreKeyword(item);
    keywords.push(item);
  }

  keywords.sort((a, b) => b.score - a.score);
  return keywords;
}

// ─── SERP FEATURES ───
/**
 * Fetch SERP features + PAA count for a keyword. Uses cache.
 */
export async function fetchSerpFeatures(keyword, langCode = "ro") {
  const cached = await getCached(keyword, langCode);
  if (cached && cached.serpFeatures?.length > 0) {
    return { serpFeatures: cached.serpFeatures, paaCount: cached.paaCount || 0, intent: classifyFromFeatures(cached.serpFeatures, keyword) };
  }
  if (!hasDfsConfig()) return { serpFeatures: [], paaCount: 0, intent: classifyIntent(keyword) };

  const language = DFS_LANGUAGE_CODES[langCode] || DFS_LANGUAGE_CODES["ro"];
  const location = DFS_LOCATION_CODES[langCode] || 2642;

  try {
    const resp = await fetch(
      "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
      {
        method:  "POST",
        headers: { Authorization: dfsAuth(), "Content-Type": "application/json" },
        body:    JSON.stringify([{ language_name: language.name, location_code: location, keyword, depth: 10, calculate_rectangles: false }]),
      }
    );
    if (!resp.ok) return { serpFeatures: [], paaCount: 0, intent: classifyIntent(keyword) };
    const data = await resp.json();
    if (data.status_code !== 20000) return { serpFeatures: [], paaCount: 0, intent: classifyIntent(keyword) };
    const result   = data.tasks?.[0]?.result?.[0];
    const features = result?.item_types || [];
    const paaItems = (result?.items || []).filter((i) => i.type === "people_also_ask");
    const paaCount = paaItems[0]?.items?.length || 0;
    if (cached) await setCached(keyword, langCode, { ...cached, serpFeatures: features, paaCount });
    return { serpFeatures: features, paaCount, intent: classifyFromFeatures(features, keyword) };
  } catch {
    return { serpFeatures: [], paaCount: 0, intent: classifyIntent(keyword) };
  }
}

// ─── BUCKET FILTER ───
export function filterKeywordsByBuckets(allKeywords, perBucket = 10) {
  const buckets = { HIGH: [], MEDIUM: [], LOW: [] };
  for (const kw of allKeywords) {
    const key = (kw.competition || "LOW").toUpperCase();
    if (buckets[key]) buckets[key].push(kw);
  }
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => (b.score || b.volume) - (a.score || a.volume));
  }
  const mediumTake = buckets.MEDIUM.slice(0, perBucket);
  const lowTake    = buckets.LOW.slice(0, perBucket);
  const highNeed   = perBucket + (perBucket - mediumTake.length) + (perBucket - lowTake.length);
  const highTake   = buckets.HIGH.slice(0, highNeed);
  const selected   = [...highTake, ...mediumTake, ...lowTake];
  const seen = new Set();
  const unique = [];
  for (const kw of selected) {
    const key = normalizeKeyword(kw.keyword);
    if (!seen.has(key)) { seen.add(key); unique.push(kw); }
  }
  return { selected: unique, counts: { high: highTake.length, medium: mediumTake.length, low: lowTake.length } };
}

// ─── INTENT ───
export function classifyIntent(keyword) {
  const kw = keyword.toLowerCase();
  if (KW_TYPE_PATTERNS.informational.test(kw)) return "informational";
  if (KW_TYPE_PATTERNS.comparative.test(kw))   return "comparative";
  return "transactional";
}

function classifyFromFeatures(features, keyword) {
  const hasT = features.some((f) => ["shopping", "paid", "google_ads", "local_services"].includes(f));
  const hasI = features.some((f) => ["featured_snippet", "knowledge_graph", "people_also_ask", "answer_box"].includes(f));
  const hasC = features.some((f) => ["top_carousel", "reviews", "carousel"].includes(f));
  if (hasT && !hasI) return "transactional";
  if (hasC && !hasT) return "comparative";
  if (hasI && !hasT) return "informational";
  return classifyIntent(keyword);
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}
