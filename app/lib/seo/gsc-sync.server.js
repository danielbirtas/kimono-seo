// app/lib/seo/gsc-sync.server.js
//
// Pulls Google Search Console performance data per page+query into SeoGscData
// for use by both Taxonomy Engine (cluster discovery, level keyword selection)
// and On-Page ECS (striking-distance scoring, CTR anomaly detection).
//
// Strategy:
//  - One bulk Search Analytics call per store, dimensions=[page, query],
//    rowLimit=25000 (GSC max). For most stores this fits in a single call.
//  - For stores past 25k rows, paginate by date window halving until we fit.
//  - Match each `page` URL to a SeoProduct by handle lookup (URL pattern
//    /products/{handle} or /collections/{handle}).
//  - Upsert into SeoGscData with the date range so we can keep historical
//    snapshots and detect deltas across refreshes.
//  - Refresh cadence: weekly cron + on-demand for a single product when ECS
//    is recalculated.

import prisma from "../../db.server.js";
import { getValidGscToken, fetchGscSearchAnalytics } from "./gsc.server.js";
import { getAllSeoSettings } from "./settings.server.js";

const GSC_MAX_ROWS_PER_CALL = 25_000;
const DEFAULT_LOOKBACK_DAYS = 90;          // weekly cron sample
const FULL_LOOKBACK_DAYS    = 16 * 30;     // initial backfill (~16 months, GSC max)

function formatDate(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n)    { return new Date(Date.now() - n * 24 * 60 * 60 * 1000); }

// Extract Shopify handle from a page URL.
// "/products/{handle}" or "/collections/{handle}". Returns null otherwise.
function parseHandleFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/(products|collections)\/([^/?#]+)/);
    if (!m) return null;
    return { kind: m[1], handle: m[2] };
  } catch {
    return null;
  }
}

// Build handle → productId map for fast matching. We rely on SeoAudit.productHandle
// (kept fresh by webhooks.products.update) for the most accurate handles.
async function buildHandleToProductMap(storeId) {
  const audits = await prisma.seoAudit.findMany({
    where: { storeId },
    select: { productId: true, productHandle: true },
  });
  const map = new Map();
  for (const a of audits) {
    if (a.productHandle) map.set(a.productHandle.toLowerCase(), a.productId);
  }
  return map;
}

// Core: pull GSC rows and persist to SeoGscData.
// Returns { rowsPulled, rowsPersisted, productsMatched, urls }.
export async function syncGscDataForStore(storeId, { lookbackDays = DEFAULT_LOOKBACK_DAYS } = {}) {
  const settings = await getAllSeoSettings(storeId);
  if (!settings.gscRefreshToken) {
    throw new Error("GSC not connected for this store");
  }
  const siteUrl = settings.gscSiteUrl;
  if (!siteUrl) throw new Error("gsc_site_url not set");

  const accessToken = await getValidGscToken(storeId, settings);

  const endDate   = formatDate(new Date());
  const startDate = formatDate(daysAgo(lookbackDays));

  // Pull dimensions=[page, query] in one bulk call. GSC returns up to 25k rows.
  // For large stores this might truncate — we detect that and shrink date range.
  let rows = await fetchGscSearchAnalytics(accessToken, siteUrl, {
    startDate, endDate,
    dimensions: ["page", "query"],
    rowLimit:   GSC_MAX_ROWS_PER_CALL,
  });

  // Truncation detection: GSC returns exactly rowLimit when more data exists.
  // For ~now we accept truncation; future work can paginate by date.
  const truncated = rows.length === GSC_MAX_ROWS_PER_CALL;

  // Match rows to products + persist via bulk delete+createMany pattern.
  // Per-row upsert was 25k×~50ms ≈ 20 min. Bulk pattern: 1 delete + 1 createMany
  // ≈ 2-5s for 25k rows. Trade-off: we wipe the snapshot for the date range
  // and re-insert. Acceptable because each sync produces a fresh snapshot.
  const handleMap = await buildHandleToProductMap(storeId);
  const dateRangeStart = new Date(startDate + "T00:00:00Z");
  const dateRangeEnd   = new Date(endDate   + "T23:59:59Z");

  let matched   = 0;
  const seenUrls = new Set();
  const records  = [];

  for (const row of rows) {
    const [pageUrl, query] = row.keys;
    if (!pageUrl || !query) continue;
    seenUrls.add(pageUrl);

    const parsed = parseHandleFromUrl(pageUrl);
    let productId = "";
    if (parsed?.kind === "products") {
      const pid = handleMap.get(parsed.handle.toLowerCase());
      if (pid) { productId = pid; matched++; }
    }

    records.push({
      storeId, productId, pageUrl,
      query:    query.toLowerCase().trim(),
      impressions: row.impressions || 0,
      clicks:      row.clicks      || 0,
      position:    row.position    || 0,
      ctr:         row.ctr         || 0,
      dateRangeStart, dateRangeEnd,
    });
  }

  // Wipe previous snapshot for this exact date range, then bulk insert.
  // (Different date ranges keep their own snapshots for historical analysis.)
  await prisma.seoGscData.deleteMany({
    where: { storeId, dateRangeStart },
  });

  // createMany doesn't enforce unique constraint dedup automatically on Postgres;
  // GSC returns each (page,query) pair once per call so duplicates shouldn't occur,
  // but we de-dupe in JS to be safe.
  const seen = new Set();
  const unique = records.filter(r => {
    const key = `${r.pageUrl}|${r.query}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let persisted = 0;
  // Chunk to 1000 per insert — Postgres handles ~16k params well, leave headroom
  const CHUNK = 1000;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const res = await prisma.seoGscData.createMany({
      data: slice,
      skipDuplicates: true,
    });
    persisted += res.count;
  }

  return {
    rowsPulled:      rows.length,
    rowsPersisted:   persisted,
    productsMatched: matched,
    uniqueUrls:      seenUrls.size,
    truncated,
    dateRange:       { start: startDate, end: endDate },
  };
}

// Read GSC data for one product. Used by ECS algorithm.
export async function getGscDataForProduct(storeId, productId, { recentOnly = true } = {}) {
  const where = { storeId, productId };
  if (recentOnly) {
    // Only the most recent date range snapshot
    const latest = await prisma.seoGscData.findFirst({
      where,
      orderBy: { dateRangeStart: "desc" },
      select:  { dateRangeStart: true },
    });
    if (!latest) return [];
    where.dateRangeStart = latest.dateRangeStart;
  }
  return prisma.seoGscData.findMany({
    where,
    orderBy: { impressions: "desc" },
    select: {
      query: true, impressions: true, clicks: true, position: true, ctr: true,
      dateRangeStart: true, dateRangeEnd: true, syncedAt: true,
    },
  });
}

// Read GSC data for a URL. Used when productId not yet known (cluster discovery).
export async function getGscDataForUrl(storeId, pageUrl) {
  return prisma.seoGscData.findMany({
    where:   { storeId, pageUrl },
    orderBy: { impressions: "desc" },
    select: {
      query: true, impressions: true, clicks: true, position: true, ctr: true,
      dateRangeStart: true, dateRangeEnd: true,
    },
  });
}

// Backfill — pulls full 16 months of history. Called once when store first
// connects GSC. Idempotent (upserts).
export async function backfillGscDataForStore(storeId) {
  return syncGscDataForStore(storeId, { lookbackDays: FULL_LOOKBACK_DAYS });
}
