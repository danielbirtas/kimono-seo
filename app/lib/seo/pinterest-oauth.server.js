// app/lib/seo/pinterest-oauth.server.js
// Pinterest OAuth 2.0 — Authorization Code grant (multi-user app)
//
// Token lifecycle (Pinterest policy effective 2025-09-25):
// - access_token: 30-day lifetime
// - refresh_token: continuous, 60-day window — rotates each refresh,
//   so we always store the new one over the old one.

import prisma from "../../db.server.js";

const AUTH_URL    = "https://www.pinterest.com/oauth/";
const TOKEN_URL   = "https://api.pinterest.com/v5/oauth/token";
const SCOPES      = "boards:read,boards:write,pins:read,pins:write,user_accounts:read";

const KEY = {
  ACCESS:  "pinterest_access_token",
  REFRESH: "pinterest_refresh_token",
  EXPIRY:  "pinterest_token_expiry",
  USER:    "pinterest_user_account",
};

function getClientId()     { return process.env.PINTEREST_CLIENT_ID     || ""; }
function getClientSecret() { return process.env.PINTEREST_CLIENT_SECRET || ""; }
function getRedirectUri() {
  const base = process.env.APP_URL || process.env.SHOPIFY_APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/pinterest-callback`;
}

export function isPinterestConfigured() {
  return !!(getClientId() && getClientSecret());
}

export async function buildPinterestAuthUrl(shopDomain) {
  if (!isPinterestConfigured()) throw new Error("Pinterest OAuth not configured (set PINTEREST_CLIENT_ID + PINTEREST_CLIENT_SECRET in Railway)");
  const { mintOauthState } = await import("./oauth-state.server.js");
  const state = await mintOauthState({ shopDomain, provider: "pinterest" });
  const params = new URLSearchParams({
    client_id:     getClientId(),
    redirect_uri:  getRedirectUri(),
    response_type: "code",
    scope:         SCOPES,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangePinterestCode(code) {
  const basic = Buffer.from(`${getClientId()}:${getClientSecret()}`).toString("base64");
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type:   "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Pinterest token exchange ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  // expires_in in seconds; expiresAt as epoch ms
  const expiresAt = Date.now() + (data.expires_in || 30 * 86400) * 1000;
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    tokenType:    data.token_type,
    scope:        data.scope,
  };
}

async function refreshPinterestToken(storeId, refreshToken) {
  const basic = Buffer.from(`${getClientId()}:${getClientSecret()}`).toString("base64");
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Pinterest token refresh ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  const expiresAt = Date.now() + (data.expires_in || 30 * 86400) * 1000;
  // Pinterest rotates the refresh token — save new one if returned
  await savePinterestTokens(storeId, {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt,
  });
  return data.access_token;
}

export async function savePinterestTokens(storeId, { accessToken, refreshToken, expiresAt, userAccount }) {
  const pairs = [
    [KEY.ACCESS,  accessToken],
    [KEY.REFRESH, refreshToken],
    [KEY.EXPIRY,  String(expiresAt)],
  ];
  if (userAccount) pairs.push([KEY.USER, JSON.stringify(userAccount)]);

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

export async function clearPinterestTokens(storeId) {
  await prisma.seoSetting.deleteMany({
    where: { storeId, key: { in: Object.values(KEY) } },
  });
}

export async function getPinterestSettings(storeId) {
  const rows = await prisma.seoSetting.findMany({
    where: { storeId, key: { in: Object.values(KEY) } },
  });
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    accessToken:  map[KEY.ACCESS]  || "",
    refreshToken: map[KEY.REFRESH] || "",
    expiresAt:    map[KEY.EXPIRY] ? parseInt(map[KEY.EXPIRY], 10) : 0,
    userAccount:  (() => { try { return map[KEY.USER] ? JSON.parse(map[KEY.USER]) : null; } catch { return null; } })(),
  };
}

export function isPinterestConnected(settings) {
  return !!(settings.accessToken && settings.refreshToken);
}

export async function getValidPinterestToken(storeId) {
  const s = await getPinterestSettings(storeId);
  if (!s.accessToken || !s.refreshToken) throw new Error("Pinterest not connected");
  // Refresh if access expires within 5 min
  if (Date.now() > s.expiresAt - 5 * 60 * 1000) {
    return refreshPinterestToken(storeId, s.refreshToken);
  }
  return s.accessToken;
}

// Fetch the connected user's profile so we can show "Connected as @username" in UI
export async function fetchPinterestUserAccount(token) {
  const resp = await fetch("https://api.pinterest.com/v5/user_account", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  return resp.json();
}
