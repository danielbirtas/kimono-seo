// app/lib/seo/gsc-triage.server.js
// Kimono SEO — GSC Keyword Triage (#01)
// Reads GSC data and makes decisions per keyword:
//   position <= 7  → AUDIT    (on-page optimization)
//   position 8-20, impressions >= 100 → BLOG  (new content needed)
//   else           → MONITOR  (watch, no action)

import prisma from "../../db.server.js";
import { getAllSeoSettings, isGscConnected } from "./settings.server.js";
import { getValidGscToken, getTopQueries } from "./gsc.server.js";

const AUDIT_MAX_POSITION   = 7;    // <= 7 → optimize existing page
const BLOG_MAX_POSITION    = 20;   // 8-20 → create content
const BLOG_MIN_IMPRESSIONS = 100;  // minimum impressions to qualify for blog
const MIN_IMPRESSIONS      = 10;   // ignore noise below this

/**
 * Decide action for a single keyword row from GSC
 */
function decideAction(row) {
  const position    = row.position    || 99;
  const impressions = row.impressions || 0;
  const clicks      = row.clicks      || 0;
  const ctr         = row.ctr         || 0;

  if (impressions < MIN_IMPRESSIONS) return "IGNORE";

  if (position <= AUDIT_MAX_POSITION) {
    // Already ranking well — optimize CTR via meta title/desc
    return "AUDIT";
  }

  if (position <= BLOG_MAX_POSITION && impressions >= BLOG_MIN_IMPRESSIONS) {
    // Ranking but not on page 1 — needs content
    return "BLOG";
  }

  return "MONITOR";
}

/**
 * Calculate priority score using skill formula:
 * priority = (log10(impressions+1) * intent_weight) / (position/10)
 */
function calcPriority(row, action) {
  const impressions = row.impressions || 0;
  const position    = row.position    || 99;

  const intentWeight = action === "AUDIT" ? 1.0 : action === "BLOG" ? 0.85 : 0.5;
  const score = (Math.log10(impressions + 1) * intentWeight) / (position / 10);
  return Math.round(Math.min(score * 100, 10000)); // scale up for integer storage
}

/**
 * Run the full triage for a store.
 * Fetches GSC data, makes decisions, saves to DB.
 */
export async function runGscTriage(storeId) {
  const settings = await getAllSeoSettings(storeId);

  if (!isGscConnected(settings)) {
    throw new Error("GSC not connected. Connect Google Search Console first.");
  }
  if (!settings.gscSiteUrl) {
    throw new Error("GSC site URL not configured.");
  }

  const accessToken = await getValidGscToken(storeId, settings);
  const rows        = await getTopQueries(accessToken, settings.gscSiteUrl, 28);

  if (!rows || rows.length === 0) {
    throw new Error("No GSC data returned. GSC may have a 2-3 day delay.");
  }

  const results = [];

  for (const row of rows) {
    const keyword = (row.keys?.[0] || "").toLowerCase().trim();
    if (!keyword) continue;

    const action   = decideAction(row);
    if (action === "IGNORE") continue;

    const priority = calcPriority(row, action);

    results.push({
      storeId,
      keyword,
      clicks:      row.clicks      || 0,
      impressions: row.impressions || 0,
      position:    Math.round((row.position || 0) * 10) / 10,
      ctr:         Math.round((row.ctr      || 0) * 1000) / 10,
      action,
      priority,
      triagedAt:   new Date(),
    });
  }

  // Save to DB — upsert per keyword
  let saved = 0;
  for (const r of results) {
    await prisma.gscTriageResult.upsert({
      where:  { storeId_keyword: { storeId: r.storeId, keyword: r.keyword } },
      update: {
        clicks:      r.clicks,
        impressions: r.impressions,
        position:    r.position,
        ctr:         r.ctr,
        action:      r.action,
        priority:    r.priority,
        triagedAt:   r.triagedAt,
      },
      create: r,
    });
    saved++;
  }

  return {
    total:   rows.length,
    saved,
    audit:   results.filter((r) => r.action === "AUDIT").length,
    blog:    results.filter((r) => r.action === "BLOG").length,
    monitor: results.filter((r) => r.action === "MONITOR").length,
  };
}

/**
 * Get triage results for display
 */
export async function getTriageResults(storeId, action = null) {
  const where = action
    ? { storeId, action }
    : { storeId };

  return prisma.gscTriageResult.findMany({
    where,
    orderBy: [{ action: "asc" }, { priority: "desc" }],
    take: 500,
  });
}
