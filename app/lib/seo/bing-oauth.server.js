// app/lib/seo/bing-oauth.server.js
// Bing Webmaster API OAuth 2.0 via Microsoft Entra (Azure AD)
//
// Token lifecycle:
// - access_token: ~1 hour
// - refresh_token: rotating + single-use — every refresh issues a NEW refresh
//   token and invalidates the old one. We persist the new one immediately,
//   inside a single transaction, to avoid invalid_grant if two concurrent
//   refresh attempts try to use the same old token.

import prisma from "../../db.server.js";

const AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL     = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const SCOPES        = "https://www.bing.com/webmasters/.default offline_access";

const KEY = {
  ACCESS:  "bing_access_token",
  REFRESH: "bing_refresh_token",
  EXPIRY:  "bing_token_expiry",
  SITE:    "bing_selected_site",
};

function getClientId()     { return process.env.BING_OAUTH_CLIENT_ID     || ""; }
function getClientSecret() { return process.env.BING_OAUTH_CLIENT_SECRET || ""; }
function getRedirectUri() {
  const base = process.env.APP_URL || process.env.SHOPIFY_APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/bing-callback`;
}

export function isBingConfigured() {
  return !!(getClientId() && getClientSecret());
}

export async function buildBingAuthUrl(shopDomain) {
  if (!isBingConfigured()) throw new Error("Bing OAuth not configured (set BING_OAUTH_CLIENT_ID + BING_OAUTH_CLIENT_SECRET in Railway)");
  const { mintOauthState } = await import("./oauth-state.server.js");
  const state = await mintOauthState({ shopDomain, provider: "bing" });
  const params = new URLSearchParams({
    client_id:     getClientId(),
    redirect_uri:  getRedirectUri(),
    response_type: "code",
    scope:         SCOPES,
    response_mode: "query",
    state,
    prompt:        "consent",   // force consent so we always get a refresh_token
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeBingCode(code) {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     getClientId(),
      client_secret: getClientSecret(),
      redirect_uri:  getRedirectUri(),
      grant_type:    "authorization_code",
      code,
      scope:         SCOPES,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Bing token exchange ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  };
}

async function refreshBingToken(storeId, refreshToken) {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     getClientId(),
      client_secret: getClientSecret(),
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
      scope:         SCOPES,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Bing token refresh ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  // Single-use rotation — save the new refresh token immediately, atomically.
  await saveBingTokens(storeId, {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt,
  });
  return data.access_token;
}

export async function saveBingTokens(storeId, { accessToken, refreshToken, expiresAt, selectedSite }) {
  const pairs = [
    [KEY.ACCESS,  accessToken],
    [KEY.REFRESH, refreshToken],
    [KEY.EXPIRY,  String(expiresAt)],
  ];
  if (selectedSite !== undefined) pairs.push([KEY.SITE, selectedSite]);

  await prisma.$transaction(
    pairs.filter(([, v]) => v !== undefined && v !== null).map(([key, value]) =>
      prisma.seoSetting.upsert({
        where:  { storeId_key: { storeId, key } },
        update: { value: String(value) },
        create: { storeId, key, value: String(value) },
      })
    )
  );
}

export async function clearBingTokens(storeId) {
  await prisma.seoSetting.deleteMany({
    where: { storeId, key: { in: Object.values(KEY) } },
  });
}

export async function getBingSettings(storeId) {
  const rows = await prisma.seoSetting.findMany({
    where: { storeId, key: { in: Object.values(KEY) } },
  });
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    accessToken:   map[KEY.ACCESS]  || "",
    refreshToken:  map[KEY.REFRESH] || "",
    expiresAt:     map[KEY.EXPIRY] ? parseInt(map[KEY.EXPIRY], 10) : 0,
    selectedSite:  map[KEY.SITE]   || "",
  };
}

export function isBingConnected(settings) {
  return !!(settings.accessToken && settings.refreshToken);
}

export async function getValidBingToken(storeId) {
  const s = await getBingSettings(storeId);
  if (!s.accessToken || !s.refreshToken) throw new Error("Bing not connected");
  if (Date.now() > s.expiresAt - 5 * 60 * 1000) {
    return refreshBingToken(storeId, s.refreshToken);
  }
  return s.accessToken;
}

export async function setSelectedBingSite(storeId, siteUrl) {
  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: KEY.SITE } },
    update: { value: siteUrl || "" },
    create: { storeId, key: KEY.SITE, value: siteUrl || "" },
  });
}
