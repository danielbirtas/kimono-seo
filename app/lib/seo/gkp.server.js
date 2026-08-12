// app/lib/seo/gkp.server.js
// ═══ Kimono SEO — Google Keyword Planner Integration ═══
import {
  GKP_MAX_PAGES,
  GKP_PAGE_SIZE,
  GKP_LANGUAGE,
  GKP_GEO,
  GKP_API_VERSION,
  KW_TYPE_PATTERNS,
} from "./constants.js";

// In-memory token cache (per process, Railway single instance)
let tokenCache = { token: null, expiresAt: 0 };

/**
 * Get a fresh Google Ads access token via refresh token flow.
 */
async function getAccessToken(settings) {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 60000) {
    return tokenCache.token;
  }

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: settings.gadsClientId,
      client_secret: settings.gadsClientSecret,
      refresh_token: settings.gadsRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OAuth error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  if (!data.access_token) {
    throw new Error("OAuth fail: no access_token in response");
  }

  tokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600) * 1000,
  };

  return tokenCache.token;
}

/**
 * Fetch keyword ideas from Google Keyword Planner with pagination.
 * @param {string} keyword - Seed keyword
 * @param {object} settings - GKP settings from getAllSeoSettings()
 * @returns {{ allKeywords: Array, total: number }}
 */
export async function fetchKeywordIdeas(keyword, settings) {
  const token = await getAccessToken(settings);
  const customerId = settings.gadsCustomerId.replace(/-/g, "");
  const mccId = settings.gadsMccId?.replace(/-/g, "") || "";

  const headers = {
    Authorization: `Bearer ${token}`,
    "developer-token": settings.gadsDevToken,
    "Content-Type": "application/json",
  };
  if (mccId && mccId !== customerId) {
    headers["login-customer-id"] = mccId;
  }

  const allKeywords = [];
  let pageToken = null;

  for (let page = 0; page < GKP_MAX_PAGES; page++) {
    const body = {
      keywordSeed: { keywords: [keyword] },
      language: GKP_LANGUAGE,
      geoTargetConstants: [GKP_GEO],
      keywordPlanNetwork: "GOOGLE_SEARCH",
      pageSize: GKP_PAGE_SIZE,
    };
    if (pageToken) body.pageToken = pageToken;

    const url = `https://googleads.googleapis.com/${GKP_API_VERSION}/customers/${customerId}:generateKeywordIdeas`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(
        `GKP ${resp.status}: ${err?.error?.message || resp.statusText}`,
      );
    }

    const data = await resp.json();
    const results = data.results || [];

    for (const r of results) {
      const kw = r.text || "";
      if (!kw) continue;

      const m = r.keywordIdeaMetrics || {};
      const vol = parseInt(m.avgMonthlySearches || 0, 10);
      let comp = (m.competition || "UNSPECIFIED").toUpperCase();
      if (comp === "UNSPECIFIED") comp = "LOW";

      const cpcLow = m.lowTopOfPageBidMicros
        ? Math.round(parseInt(m.lowTopOfPageBidMicros, 10) / 1e6 * 100) / 100
        : 0;
      const cpcHigh = m.highTopOfPageBidMicros
        ? Math.round(parseInt(m.highTopOfPageBidMicros, 10) / 1e6 * 100) / 100
        : 0;

      const kwLower = kw.toLowerCase();
      let kwType = "transactional";
      if (KW_TYPE_PATTERNS.informational.test(kwLower)) kwType = "informational";
      else if (KW_TYPE_PATTERNS.comparative.test(kwLower)) kwType = "comparative";

      allKeywords.push({
        keyword: kw,
        volume: vol,
        competition: comp,
        cpcLow,
        cpcHigh,
        type: kwType,
      });
    }

    pageToken = data.nextPageToken || null;
    if (!pageToken || results.length < GKP_PAGE_SIZE) break;
  }

  return { allKeywords, total: allKeywords.length };
}

/**
 * Filter keywords into competition buckets: N HIGH + N MEDIUM + N LOW.
 * If MEDIUM/LOW gaps exist, fill with extra HIGH keywords.
 * Deduplicates by keyword text.
 */
export function filterKeywordsByBuckets(allKeywords, perBucket = 10) {
  const buckets = { HIGH: [], MEDIUM: [], LOW: [] };

  for (const kw of allKeywords) {
    if (buckets[kw.competition]) {
      buckets[kw.competition].push(kw);
    }
  }

  // Sort each bucket by volume descending
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => b.volume - a.volume);
  }

  const mediumTake = buckets.MEDIUM.slice(0, perBucket);
  const lowTake = buckets.LOW.slice(0, perBucket);

  // Fill gaps with extra HIGH
  const mediumGap = perBucket - mediumTake.length;
  const lowGap = perBucket - lowTake.length;
  const highNeed = perBucket + mediumGap + lowGap;
  const highTake = buckets.HIGH.slice(0, highNeed);

  const selected = [...highTake, ...mediumTake, ...lowTake];

  // Deduplicate
  const seen = new Set();
  const unique = [];
  for (const kw of selected) {
    const key = kw.keyword.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(kw);
    }
  }

  return {
    selected: unique,
    counts: {
      high: highTake.length,
      medium: mediumTake.length,
      low: lowTake.length,
    },
  };
}
