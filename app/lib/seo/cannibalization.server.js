// app/lib/seo/cannibalization.server.js
// Kimono SEO #21 — Keyword Cannibalization Detector
// Uses GSC query+page dimensions to find keywords ranking on multiple URLs

import prisma from "../../db.server.js";

async function getGscToken(storeId) {
  const [tokenSetting, secretSetting] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "seo_gsc_refresh_token" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "seo_gsc_site_url" } } }),
  ]);
  if (!tokenSetting?.value) throw new Error("GSC not connected");

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
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

async function fetchGscQueryPage(accessToken, siteUrl, startDate, endDate) {
  const resp = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method:  "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify({
        startDate,
        endDate,
        dimensions:  ["query", "page"],
        rowLimit:    5000,
        dataState:   "final",
      }),
    }
  );
  const data = await resp.json();
  if (data.error) throw new Error(`GSC error: ${data.error.message}`);
  return data.rows || [];
}

function formatDate(d) { return d.toISOString().split("T")[0]; }

export async function runCannibalizationDetection(storeId) {
  const { accessToken, siteUrl } = await getGscToken(storeId);
  if (!siteUrl) throw new Error("GSC site URL not configured");

  const end   = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 90);

  console.log(`[Cannibal] Fetching GSC data for ${siteUrl}`);
  const rows = await fetchGscQueryPage(accessToken, siteUrl, formatDate(start), formatDate(end));
  console.log(`[Cannibal] ${rows.length} query+page rows`);

  // Group by keyword → collect all URLs + metrics
  const kwMap = {};
  for (const row of rows) {
    const keyword = (row.keys?.[0] || "").toLowerCase().trim();
    const page    = row.keys?.[1] || "";
    if (!keyword || !page) continue;

    // Skip very low impression queries
    if ((row.impressions || 0) < 10) continue;

    if (!kwMap[keyword]) kwMap[keyword] = { keyword, totalImpressions: 0, urls: [] };

    kwMap[keyword].totalImpressions += row.impressions || 0;
    kwMap[keyword].urls.push({
      url:         page,
      clicks:      row.clicks      || 0,
      impressions: row.impressions || 0,
      position:    Math.round((row.position || 99) * 10) / 10,
      ctr:         Math.round((row.ctr || 0) * 1000) / 10,
    });
  }

  // Find keywords with 2+ URLs — true cannibalization
  const cannibalKws = Object.values(kwMap)
    .filter(k => k.urls.length >= 2)
    .map(k => {
      // Sort URLs: winner (best position / most clicks) first
      const sorted = k.urls.sort((a, b) => a.position - b.position);
      const winner = sorted[0];
      const losers = sorted.slice(1);

      // Severity based on: close positions between URLs = high conflict
      const positionSpread = sorted[sorted.length - 1].position - sorted[0].position;
      const severity = positionSpread < 5 ? "high"
        : positionSpread < 15 ? "medium"
        : "low";

      // Suggested fix
      const winnerPath = winner.url.replace(/https?:\/\/[^/]+/, "");
      const fix = winnerPath.startsWith("/products/") ? "canonical"
        : winnerPath.startsWith("/collections/") ? "canonical"
        : winnerPath.startsWith("/blogs/") ? "merge_content"
        : "canonical";

      return {
        keyword:       k.keyword,
        totalImpressions: k.totalImpressions,
        urlCount:      k.urls.length,
        severity,
        fix,
        winner,
        losers,
        positionSpread: Math.round(positionSpread * 10) / 10,
      };
    })
    .sort((a, b) => {
      // Sort by severity then impressions
      const sev = { high: 3, medium: 2, low: 1 };
      if (sev[b.severity] !== sev[a.severity]) return sev[b.severity] - sev[a.severity];
      return b.totalImpressions - a.totalImpressions;
    });

  const result = {
    siteUrl,
    totalKeywords:      Object.keys(kwMap).length,
    cannibalized:       cannibalKws.length,
    highSeverity:       cannibalKws.filter(k => k.severity === "high").length,
    mediumSeverity:     cannibalKws.filter(k => k.severity === "medium").length,
    lowSeverity:        cannibalKws.filter(k => k.severity === "low").length,
    keywords:           cannibalKws.slice(0, 200),
    dateRange:          `${formatDate(start)} → ${formatDate(end)}`,
    analyzedAt:         new Date().toISOString(),
  };

  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: "cannibalization_results" } },
    create: { storeId, key: "cannibalization_results", value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });

  console.log(`[Cannibal] Done — ${cannibalKws.length} cannibalized keywords (${result.highSeverity} high)`);
  return result;
}

export async function getCannibalizationResults(storeId) {
  const s = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "cannibalization_results" } },
  });
  if (!s?.value) return null;
  try { return JSON.parse(s.value); } catch { return null; }
}
