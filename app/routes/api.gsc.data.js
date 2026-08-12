// app/routes/api.gsc.data.js
// ═══ Kimono SEO — GSC Search Analytics API ═══
// Returns clicks, impressions, CTR, avg position for the connected GSC property.
// Called from the GSC section in app.seo.jsx via fetcher.

import { getAllSeoSettings, isGscConnected } from "../lib/seo/settings.server.js";
import {
  getValidGscToken,
  getTopQueries,
  getTopPages,
  getPerformanceTrend,
} from "../lib/seo/gsc.server.js";

export const loader = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });
  const settings = await getAllSeoSettings(storeId);

  if (!isGscConnected(settings)) {
    return Response.json({ success: false, error: "GSC not connected.", notConnected: true });
  }

  const url = new URL(request.url);
  const view  = url.searchParams.get("view")  || "queries";  // queries | pages | trend
  const days  = parseInt(url.searchParams.get("days") || "28", 10);

  try {
    const accessToken = await getValidGscToken(storeId, settings);
    const siteUrl = settings.gscSiteUrl;

    if (!siteUrl) {
      return Response.json({ success: false, error: "GSC site not selected.", noSite: true });
    }

    let data = [];

    if (view === "queries") {
      data = await getTopQueries(accessToken, siteUrl, days);
    } else if (view === "pages") {
      data = await getTopPages(accessToken, siteUrl, days);
    } else if (view === "trend") {
      data = await getPerformanceTrend(accessToken, siteUrl, days);
    }

    // Normalise rows: keys array -> individual fields
    const rows = data.map((row) => ({
      label:       row.keys?.[0] || "",
      clicks:      row.clicks       || 0,
      impressions: row.impressions  || 0,
      ctr:         Math.round((row.ctr || 0) * 1000) / 10,  // percent, 1 decimal
      position:    Math.round((row.position || 0) * 10) / 10,
    }));

    // Summary totals
    const totalClicks      = rows.reduce((s, r) => s + r.clicks, 0);
    const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
    const avgCtr = totalImpressions > 0
      ? Math.round((totalClicks / totalImpressions) * 1000) / 10
      : 0;
    const avgPosition = rows.length > 0
      ? Math.round((rows.reduce((s, r) => s + r.position, 0) / rows.length) * 10) / 10
      : 0;

    return Response.json({
      success: true,
      data: {
        siteUrl,
        view,
        days,
        rows:            rows.slice(0, 200),  // Cap at 200 for UI
        summary: {
          totalClicks,
          totalImpressions,
          avgCtr,
          avgPosition,
        },
      },
    });
  } catch (err) {
    console.error("[GSC Data]", err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
};

// ─── ACTIONS ───
// POST: set site URL or disconnect GSC

export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const { intent } = body;

  if (intent === "set_site") {
    const { siteUrl } = body;
    if (!siteUrl) {
      return Response.json({ success: false, error: "siteUrl required." }, { status: 400 });
    }
    const { setSeoSetting } = await import("../lib/seo/settings.server.js");
    const { SEO_KEYS } = await import("../lib/seo/constants.js");
    await setSeoSetting(storeId, SEO_KEYS.GSC_SITE_URL, siteUrl);
    return Response.json({ success: true });
  }

  if (intent === "disconnect") {
    const { clearGscTokens } = await import("../lib/seo/settings.server.js");
    await clearGscTokens(storeId);
    return Response.json({ success: true });
  }

  if (intent === "list_sites") {
    const settings = await getAllSeoSettings(storeId);
    if (!isGscConnected(settings)) {
      return Response.json({ success: false, error: "GSC not connected." });
    }
    try {
      const accessToken = await getValidGscToken(storeId, settings);
      const { listGscSites } = await import("../lib/seo/gsc.server.js");
      const sites = await listGscSites(accessToken);
      return Response.json({ success: true, sites });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  return Response.json({ success: false, error: "Unknown intent." }, { status: 400 });
};