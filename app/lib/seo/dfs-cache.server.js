// app/lib/seo/dfs-cache.server.js
// ═══ Kimono SEO — DataForSEO Cache Layer ═══
// Platform-level cache shared across all stores.
// TTL: 30 days. Key: keyword + locationCode + languageCode.
// Reduces DataForSEO API costs significantly on repeated lookups.

import prisma from "../../db.server.js";
import { DFS_LOCATION_CODES, DFS_LANGUAGE_CODES } from "./constants.js";

const CACHE_TTL_DAYS = 30;

/**
 * Get cached DataForSEO data for a keyword.
 * Returns null if not cached or expired.
 */
export async function getCached(keyword, langCode = "ro") {
  const keywordNorm = normalizeKeyword(keyword);
  const locationCode = DFS_LOCATION_CODES[langCode] || 2642;
  const languageCode = langCode;

  const row = await prisma.dfsCache.findUnique({
    where: { keyword_locationCode_languageCode: { keyword: keywordNorm, locationCode, languageCode } },
  });

  if (!row) return null;
  if (new Date() > row.expiresAt) {
    // Expired — delete and return null
    await prisma.dfsCache.delete({
      where: { keyword_locationCode_languageCode: { keyword: keywordNorm, locationCode, languageCode } },
    }).catch(() => {});
    return null;
  }

  return {
    keyword:      row.keyword,
    volume:       row.volume,
    difficulty:   row.difficulty,
    cpc:          row.cpc,
    competition:  row.competition,
    serpFeatures: JSON.parse(row.serpFeatures || "[]"),
    paaCount:     row.paaCount,
    trend:        JSON.parse(row.trend || "[]"),
    fromCache:    true,
  };
}

/**
 * Store DataForSEO data in cache.
 */
export async function setCached(keyword, langCode = "ro", data) {
  const keywordNorm  = normalizeKeyword(keyword);
  const locationCode = DFS_LOCATION_CODES[langCode] || 2642;
  const languageCode = langCode;
  const expiresAt    = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.dfsCache.upsert({
    where: { keyword_locationCode_languageCode: { keyword: keywordNorm, locationCode, languageCode } },
    update: {
      volume:       data.volume       ?? 0,
      difficulty:   data.difficulty   ?? 0,
      cpc:          data.cpc          ?? 0,
      competition:  data.competition  ?? "LOW",
      serpFeatures: JSON.stringify(data.serpFeatures ?? []),
      paaCount:     data.paaCount     ?? 0,
      trend:        JSON.stringify(data.trend ?? []),
      cachedAt:     new Date(),
      expiresAt,
    },
    create: {
      keyword:      keywordNorm,
      locationCode,
      languageCode,
      volume:       data.volume       ?? 0,
      difficulty:   data.difficulty   ?? 0,
      cpc:          data.cpc          ?? 0,
      competition:  data.competition  ?? "LOW",
      serpFeatures: JSON.stringify(data.serpFeatures ?? []),
      paaCount:     data.paaCount     ?? 0,
      trend:        JSON.stringify(data.trend ?? []),
      expiresAt,
    },
  });
}

/**
 * Bulk fetch with cache — returns cached entries and list of misses.
 * Use this before calling DataForSEO to minimize API calls.
 *
 * @param {string[]} keywords
 * @param {string} langCode
 * @returns {{ hits: Map<string, object>, misses: string[] }}
 */
export async function getBulkCached(keywords, langCode = "ro") {
  const locationCode = DFS_LOCATION_CODES[langCode] || 2642;
  const languageCode = langCode;
  const now = new Date();

  const normed = keywords.map(normalizeKeyword);

  const rows = await prisma.dfsCache.findMany({
    where: {
      keyword:      { in: normed },
      locationCode,
      languageCode,
      expiresAt:    { gt: now },
    },
  });

  const hits = new Map();
  for (const row of rows) {
    hits.set(row.keyword, {
      keyword:      row.keyword,
      volume:       row.volume,
      difficulty:   row.difficulty,
      cpc:          row.cpc,
      competition:  row.competition,
      serpFeatures: JSON.parse(row.serpFeatures || "[]"),
      paaCount:     row.paaCount,
      trend:        JSON.parse(row.trend || "[]"),
      fromCache:    true,
    });
  }

  const misses = normed.filter((k) => !hits.has(k));

  return { hits, misses };
}

/**
 * Store bulk results in cache.
 * @param {Array<{keyword, volume, difficulty, cpc, competition, serpFeatures, paaCount, trend}>} results
 * @param {string} langCode
 */
export async function setBulkCached(results, langCode = "ro") {
  const locationCode = DFS_LOCATION_CODES[langCode] || 2642;
  const languageCode = langCode;
  const expiresAt    = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);

  for (const data of results) {
    const keywordNorm = normalizeKeyword(data.keyword);
    await prisma.dfsCache.upsert({
      where: { keyword_locationCode_languageCode: { keyword: keywordNorm, locationCode, languageCode } },
      update: {
        volume:       data.volume       ?? 0,
        difficulty:   data.difficulty   ?? 0,
        cpc:          data.cpc          ?? 0,
        competition:  data.competition  ?? "LOW",
        serpFeatures: JSON.stringify(data.serpFeatures ?? []),
        paaCount:     data.paaCount     ?? 0,
        trend:        JSON.stringify(data.trend        ?? []),
        cachedAt:     new Date(),
        expiresAt,
      },
      create: {
        keyword:      keywordNorm,
        locationCode,
        languageCode,
        volume:       data.volume       ?? 0,
        difficulty:   data.difficulty   ?? 0,
        cpc:          data.cpc          ?? 0,
        competition:  data.competition  ?? "LOW",
        serpFeatures: JSON.stringify(data.serpFeatures ?? []),
        paaCount:     data.paaCount     ?? 0,
        trend:        JSON.stringify(data.trend        ?? []),
        expiresAt,
      },
    }).catch((e) => console.warn(`[DfsCache] upsert failed for "${keywordNorm}":`, e.message));
  }
}

/**
 * Delete expired cache entries (run periodically).
 */
export async function pruneExpiredCache() {
  const result = await prisma.dfsCache.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

/**
 * Cache stats — useful for dashboard/debugging.
 */
export async function getCacheStats() {
  const now = new Date();
  const [total, expired, fresh] = await Promise.all([
    prisma.dfsCache.count(),
    prisma.dfsCache.count({ where: { expiresAt: { lt: now } } }),
    prisma.dfsCache.count({ where: { expiresAt: { gt: now } } }),
  ]);
  return { total, expired, fresh };
}

// ── Normalize keyword for consistent cache keys ──
export function normalizeKeyword(kw) {
  return kw
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/\s+/g, " ");
}
