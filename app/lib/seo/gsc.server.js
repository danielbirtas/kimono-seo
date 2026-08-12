// app/lib/seo/gsc.server.js
// ═══ Kimono SEO — Google Search Console Integration ═══
// OAuth 2.0 flow + data fetching for GSC Search Analytics API
//
// ENV variables required:
//   GSC_CLIENT_ID      — Google OAuth client ID (Web application type)
//   GSC_CLIENT_SECRET  — Google OAuth client secret
//   SHOPIFY_APP_URL    — Base URL of the app (for redirect URI)
//
// Scopes requested: https://www.googleapis.com/auth/webmasters.readonly

import { saveGscTokens, gscTokenNeedsRefresh } from "./settings.server.js";
import { SEO_KEYS } from "./constants.js";
import prisma from "../../db.server.js";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

// ─── HELPERS ───

function getRedirectUri() {
  const base = process.env.APP_URL || process.env.SHOPIFY_APP_URL || "http://localhost:3000";
  return `${base}/gsc-callback`;
}

function getClientId() {
  return process.env.GSC_CLIENT_ID || "";
}

function getClientSecret() {
  return process.env.GSC_CLIENT_SECRET || "";
}

// ─── OAUTH FLOW ───

/**
 * Generate the Google OAuth authorization URL.
 * The state param encodes the shopDomain so we can look up the store on callback.
 *
 * @param {string} shopDomain - e.g. "mystore.myshopify.com"
 * @returns {string} Full authorization URL to redirect the user to
 */
export function buildGscAuthUrl(shopDomain) {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: GSC_SCOPE,
    access_type: "offline",
    prompt: "consent",            // Always ask for consent to get refresh_token
    state: Buffer.from(shopDomain).toString("base64"),
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access + refresh tokens.
 * Called from the OAuth callback route.
 *
 * @param {string} code        - Code from Google OAuth callback
 * @param {string} shopDomain  - Decoded from state param
 * @returns {{ accessToken, refreshToken, expiresAt }}
 */
export async function exchangeGscCode(code, shopDomain) {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`GSC token exchange failed ${resp.status}: ${err}`);
  }

  const data = await resp.json();

  if (!data.access_token) {
    throw new Error("GSC OAuth: no access_token in response");
  }

  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token || "",
    expiresAt:    Date.now() + (data.expires_in || 3600) * 1000,
  };
}

/**
 * Refresh an expired GSC access token using the stored refresh token.
 * Updates the stored tokens automatically.
 *
 * @param {string} storeId
 * @param {string} refreshToken
 * @returns {string} New access token
 */
export async function refreshGscToken(storeId, refreshToken) {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`GSC token refresh failed ${resp.status}: ${err}`);
  }

  const data = await resp.json();

  if (!data.access_token) {
    throw new Error("GSC token refresh: no access_token in response");
  }

  const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;

  await saveGscTokens(storeId, {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token || refreshToken, // Google may not return new refresh token
    expiresAt,
    siteUrl: null, // Don't overwrite siteUrl on refresh
  });

  return data.access_token;
}

/**
 * Get a valid GSC access token, refreshing if needed.
 *
 * @param {string} storeId
 * @param {object} settings - from getAllSeoSettings()
 * @returns {string} Valid access token
 */
export async function getValidGscToken(storeId, settings) {
  if (!settings.gscRefreshToken) {
    throw new Error("GSC not connected. No refresh token found.");
  }

  if (!gscTokenNeedsRefresh(settings)) {
    return settings.gscAccessToken;
  }

  return refreshGscToken(storeId, settings.gscRefreshToken);
}

// ─── LIST SITES ───

/**
 * Fetch list of verified GSC properties for the connected account.
 * Used to let the user pick which site to track.
 *
 * @param {string} accessToken
 * @returns {string[]} Array of site URLs
 */
export async function listGscSites(accessToken) {
  const resp = await fetch(
    "https://www.googleapis.com/webmasters/v3/sites",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`GSC sites list failed ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return (data.siteEntry || []).map((s) => s.siteUrl);
}

// ─── SEARCH ANALYTICS ───

/**
 * Fetch Search Analytics data from GSC.
 *
 * @param {string} accessToken
 * @param {string} siteUrl     - e.g. "https://mystore.com/" or "sc-domain:mystore.com"
 * @param {object} options
 * @param {string} options.startDate  - "YYYY-MM-DD"
 * @param {string} options.endDate    - "YYYY-MM-DD"
 * @param {string[]} options.dimensions - ["query", "page", "country", "device", "date"]
 * @param {number} options.rowLimit   - Max rows (default 1000, max 25000)
 * @returns {Array<{keys, clicks, impressions, ctr, position}>}
 */
export async function fetchGscSearchAnalytics(accessToken, siteUrl, options = {}) {
  const {
    startDate,
    endDate,
    dimensions = ["query"],
    rowLimit = 1000,
    filters = [],
  } = options;

  const body = {
    startDate,
    endDate,
    dimensions,
    rowLimit,
  };

  if (filters.length > 0) {
    body.dimensionFilterGroups = [{ filters }];
  }

  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(
      `GSC Search Analytics failed ${resp.status}: ${err?.error?.message || resp.statusText}`
    );
  }

  const data = await resp.json();
  return data.rows || [];
}

// ─── CONVENIENCE WRAPPERS ───

/**
 * Top queries (keywords) driving traffic — last 28 days.
 * Returns up to 1000 queries with clicks, impressions, CTR, avg position.
 */
export async function getTopQueries(accessToken, siteUrl, days = 28) {
  const endDate = formatDate(new Date());
  const startDate = formatDate(daysAgo(days));

  return fetchGscSearchAnalytics(accessToken, siteUrl, {
    startDate,
    endDate,
    dimensions: ["query"],
    rowLimit: 1000,
  });
}

/**
 * Top pages by clicks — last 28 days.
 */
export async function getTopPages(accessToken, siteUrl, days = 28) {
  const endDate = formatDate(new Date());
  const startDate = formatDate(daysAgo(days));

  return fetchGscSearchAnalytics(accessToken, siteUrl, {
    startDate,
    endDate,
    dimensions: ["page"],
    rowLimit: 500,
  });
}

/**
 * Performance over time (by date) — useful for trend charts.
 */
export async function getPerformanceTrend(accessToken, siteUrl, days = 90) {
  const endDate = formatDate(new Date());
  const startDate = formatDate(daysAgo(days));

  return fetchGscSearchAnalytics(accessToken, siteUrl, {
    startDate,
    endDate,
    dimensions: ["date"],
    rowLimit: 90,
  });
}

/**
 * Queries for a specific page URL.
 * Useful for checking which keywords drive traffic to a product page.
 */
export async function getQueriesForPage(accessToken, siteUrl, pageUrl, days = 28) {
  const endDate = formatDate(new Date());
  const startDate = formatDate(daysAgo(days));

  return fetchGscSearchAnalytics(accessToken, siteUrl, {
    startDate,
    endDate,
    dimensions: ["query"],
    rowLimit: 500,
    filters: [
      {
        dimension: "page",
        operator: "contains",
        expression: pageUrl,
      },
    ],
  });
}

// ─── UTILS ───
function formatDate(d) {
  return d.toISOString().split("T")[0];
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
