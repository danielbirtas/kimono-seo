// app/lib/seo/content-decay.server.js
// Kimono SEO #19 — Content Decay Detection
// Compares GSC position/clicks for blog articles: current 28 days vs previous 28 days
// Articles with >20% position decline → flagged for refresh

import prisma from "../../db.server.js";

const DECAY_THRESHOLD_PCT = 20;  // % position decline to flag
const DECAY_MIN_IMPRESSIONS = 50; // min impressions to be relevant

// ─── GSC token refresh ────────────────────────────────────────────────────────
async function getGscAccessToken(storeId) {
  const [tokenSetting, secretSetting] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "seo_gsc_refresh_token" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "seo_gsc_site_url" } } }),
  ]);

  if (!tokenSetting?.value) throw new Error("GSC not connected");

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: tokenSetting.value,
      client_id:     process.env.GSC_CLIENT_ID     || "",
      client_secret: process.env.GSC_CLIENT_SECRET || "",
      grant_type:    "refresh_token",
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error("Could not refresh GSC token");

  return { accessToken: data.access_token, siteUrl: secretSetting?.value || "" };
}

// ─── Fetch GSC page-level data for a date range ───────────────────────────────
async function fetchGscPages(accessToken, siteUrl, startDate, endDate) {
  const resp = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["page"],
        rowLimit: 500,
        dataState: "final",
      }),
    }
  );
  const data = await resp.json();
  return data.rows || [];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function formatDate(d) {
  return d.toISOString().split("T")[0];
}

function getDateRanges() {
  const now      = new Date();
  const curr_end = new Date(now); curr_end.setDate(curr_end.getDate() - 3); // GSC delay
  const curr_start = new Date(curr_end); curr_start.setDate(curr_start.getDate() - 27);
  const prev_end   = new Date(curr_start); prev_end.setDate(prev_end.getDate() - 1);
  const prev_start = new Date(prev_end); prev_start.setDate(prev_start.getDate() - 27);

  return {
    current: { start: formatDate(curr_start), end: formatDate(curr_end) },
    previous: { start: formatDate(prev_start), end: formatDate(prev_end) },
  };
}

// ─── Main decay detection ─────────────────────────────────────────────────────
export async function detectContentDecay(storeId) {
  console.log(`[Decay] Starting detection for store ${storeId}`);

  const { accessToken, siteUrl } = await getGscAccessToken(storeId);
  if (!siteUrl) throw new Error("GSC site URL not configured");

  const { current, previous } = getDateRanges();
  console.log(`[Decay] Comparing ${previous.start}→${previous.end} vs ${current.start}→${current.end}`);

  const [currRows, prevRows] = await Promise.all([
    fetchGscPages(accessToken, siteUrl, current.start, current.end),
    fetchGscPages(accessToken, siteUrl, previous.start, previous.end),
  ]);

  // Build maps keyed by page URL
  const currMap = {};
  for (const r of currRows) {
    const page = r.keys?.[0];
    if (page) currMap[page] = { clicks: r.clicks, impressions: r.impressions, position: r.position };
  }
  const prevMap = {};
  for (const r of prevRows) {
    const page = r.keys?.[0];
    if (page) prevMap[page] = { clicks: r.clicks, impressions: r.impressions, position: r.position };
  }

  // Filter to blog article URLs only
  const blogPattern = /\/blogs\//;
  const decayResults = [];

  for (const [page, curr] of Object.entries(currMap)) {
    if (!blogPattern.test(page)) continue;
    const prev = prevMap[page];
    if (!prev) continue;

    const avgImpressions = (curr.impressions + prev.impressions) / 2;
    if (avgImpressions < DECAY_MIN_IMPRESSIONS) continue;

    // Position increase = ranking dropped (worse)
    const positionDelta = curr.position - prev.position;
    const positionDeltaPct = prev.position > 0 ? (positionDelta / prev.position) * 100 : 0;
    const clicksDelta = curr.clicks - prev.clicks;

    if (positionDeltaPct >= DECAY_THRESHOLD_PCT) {
      decayResults.push({
        page,
        prevPosition:    Math.round(prev.position * 10) / 10,
        currPosition:    Math.round(curr.position * 10) / 10,
        positionDelta:   Math.round(positionDeltaPct),
        prevClicks:      prev.clicks,
        currClicks:      curr.clicks,
        clicksDelta,
        impressions:     Math.round(avgImpressions),
        severity:        positionDeltaPct >= 50 ? "high" : positionDeltaPct >= 30 ? "medium" : "low",
      });
    }
  }

  // Sort by severity then position delta
  decayResults.sort((a, b) => b.positionDelta - a.positionDelta);

  console.log(`[Decay] Found ${decayResults.length} decaying articles`);

  // Save to DB
  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: "content_decay_results" } },
    create: { storeId, key: "content_decay_results", value: JSON.stringify({ results: decayResults, checkedAt: new Date().toISOString(), ranges: { current, previous } }) },
    update: { value: JSON.stringify({ results: decayResults, checkedAt: new Date().toISOString(), ranges: { current, previous } }) },
  });

  return { results: decayResults, ranges: { current, previous } };
}

// ─── Get saved results ────────────────────────────────────────────────────────
export async function getDecayResults(storeId) {
  const setting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "content_decay_results" } },
  });
  if (!setting?.value) return null;
  try { return JSON.parse(setting.value); } catch { return null; }
}
