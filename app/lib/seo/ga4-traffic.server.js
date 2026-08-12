// app/lib/seo/ga4-traffic.server.js
// Kimono SEO #30 — AI Traffic Monitor (GA4)
// Tracks traffic from ChatGPT, Perplexity, Claude, Gemini, Copilot via GA4 Reporting API

import prisma from "../../db.server.js";

// AI traffic sources to monitor
export const AI_SOURCES = [
  { id: "chatgpt",    name: "ChatGPT",    domain: "chatgpt.com",           color: "#10B981", icon: "🤖" },
  { id: "perplexity", name: "Perplexity", domain: "perplexity.ai",         color: "#6366F1", icon: "🔮" },
  { id: "claude",     name: "Claude",     domain: "claude.ai",             color: "#F97316", icon: "🧠" },
  { id: "gemini",     name: "Gemini",     domain: "gemini.google.com",     color: "#3B82F6", icon: "💫" },
  { id: "copilot",    name: "Copilot",    domain: "copilot.microsoft.com", color: "#0EA5E9", icon: "🪁" },
  { id: "bing_ai",    name: "Bing AI",    domain: "bing.com",              color: "#0284C7", icon: "🔵" },
  { id: "you",        name: "You.com",    domain: "you.com",               color: "#8B5CF6", icon: "🔍" },
];

// ─── OAuth helpers ────────────────────────────────────────────────────────────
export function getGa4AuthUrl(shopDomain) {
  const redirectUri = `${process.env.APP_URL || process.env.SHOPIFY_APP_URL || "http://localhost:3000"}/ga4-callback`;
  // Use URL-safe base64 encoding and store shop in state
  const state = Buffer.from(shopDomain).toString("base64url");
  const scopes = "https://www.googleapis.com/auth/analytics.readonly";

  return `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(process.env.GSC_CLIENT_ID || "")}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${state}`;
}

export async function exchangeGa4Code(code, shopDomain) {
  const redirectUri = `${process.env.APP_URL || process.env.SHOPIFY_APP_URL || "http://localhost:3000"}/ga4-callback`;
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GSC_CLIENT_ID     || "",
      client_secret: process.env.GSC_CLIENT_SECRET || "",
      redirect_uri:  redirectUri,
      grant_type:    "authorization_code",
    }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    new Date(Date.now() + (data.expires_in || 3600) * 1000),
  };
}

async function refreshGa4Token(refreshToken) {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token:  refreshToken,
      client_id:      process.env.GSC_CLIENT_ID     || "",
      client_secret:  process.env.GSC_CLIENT_SECRET || "",
      grant_type:     "refresh_token",
    }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

// ─── List GA4 properties ──────────────────────────────────────────────────────
export async function listGa4Properties(accessToken) {
  // Use Account Summaries — works with analytics.readonly scope
  const resp = await fetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await resp.json();

  if (data.error) {
    console.warn("[GA4] listGa4Properties error:", data.error.message);
    return [];
  }

  const properties = [];
  for (const account of (data.accountSummaries || [])) {
    for (const prop of (account.propertySummaries || [])) {
      properties.push({
        id:         prop.property.replace("properties/", ""),
        name:       prop.displayName,
        websiteUrl: "",
      });
    }
  }
  return properties;
}

// ─── Save GA4 tokens ──────────────────────────────────────────────────────────
export async function saveGa4Tokens(storeId, { accessToken, refreshToken, expiresAt, propertyId, propertyName }) {
  const upsert = (key, value) => prisma.seoSetting.upsert({
    where: { storeId_key: { storeId, key } },
    create: { storeId, key, value: String(value) },
    update: { value: String(value) },
  });
  await Promise.all([
    upsert("ga4_refresh_token",  refreshToken || ""),
    upsert("ga4_access_token",   accessToken  || ""),
    upsert("ga4_expires_at",     expiresAt?.toISOString() || ""),
    propertyId   ? upsert("ga4_property_id",   propertyId)   : Promise.resolve(),
    propertyName ? upsert("ga4_property_name", propertyName) : Promise.resolve(),
  ]);
}

export async function getGa4Settings(storeId) {
  const settings = await prisma.seoSetting.findMany({
    where: { storeId, key: { in: ["ga4_refresh_token", "ga4_access_token", "ga4_expires_at", "ga4_property_id", "ga4_property_name"] } },
  });
  return Object.fromEntries(settings.map(s => [s.key.replace("ga4_", ""), s.value]));
}

export async function isGa4Connected(storeId) {
  const s = await getGa4Settings(storeId);
  return !!(s.refresh_token && s.property_id);
}

// ─── Get valid access token ───────────────────────────────────────────────────
async function getValidToken(storeId) {
  const s = await getGa4Settings(storeId);
  if (!s.refresh_token) throw new Error("GA4 not connected");

  const expiresAt = s.expires_at ? new Date(s.expires_at) : new Date(0);
  if (expiresAt > new Date(Date.now() + 60000)) return s.access_token;

  const newToken = await refreshGa4Token(s.refresh_token);
  await prisma.seoSetting.upsert({
    where: { storeId_key: { storeId, key: "ga4_access_token" } },
    create: { storeId, key: "ga4_access_token", value: newToken },
    update: { value: newToken },
  });
  await prisma.seoSetting.upsert({
    where: { storeId_key: { storeId, key: "ga4_expires_at" } },
    create: { storeId, key: "ga4_expires_at", value: new Date(Date.now() + 3500000).toISOString() },
    update: { value: new Date(Date.now() + 3500000).toISOString() },
  });
  return newToken;
}

// ─── Query GA4 Reporting API ──────────────────────────────────────────────────
async function queryGa4(propertyId, accessToken, body) {
  const resp = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || "GA4 API error");
  return data;
}

// ─── Main: fetch AI traffic data ─────────────────────────────────────────────
export async function fetchAiTrafficData(storeId, days = 30) {
  const settings = await getGa4Settings(storeId);
  if (!settings.refresh_token || !settings.property_id) {
    throw new Error("GA4 not connected or property not selected");
  }

  const accessToken  = await getValidToken(storeId);
  const propertyId   = settings.property_id;
  const endDate      = "today";
  const startDate    = `${days}daysAgo`;

  // Query 1: Sessions per AI source
  const sessionData = await queryGa4(propertyId, accessToken, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "sessionSource" }, { name: "date" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "conversions" },
      { name: "totalRevenue" },
    ],
    dimensionFilter: {
      orGroup: {
        expressions: AI_SOURCES.map(s => ({
          filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: s.domain.split(".")[0] } }
        }))
      }
    },
    orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
    limit: 1000,
  });

  // Query 2: Top pages from AI traffic
  const pageData = await queryGa4(propertyId, accessToken, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "sessionSource" }, { name: "pagePath" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
    dimensionFilter: {
      orGroup: {
        expressions: AI_SOURCES.map(s => ({
          filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: s.domain.split(".")[0] } }
        }))
      }
    },
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 50,
  });

  // Process session data
  const bySource = {};
  const timeline = {};

  for (const row of (sessionData.rows || [])) {
    const source   = row.dimensionValues[0].value;
    const date     = row.dimensionValues[1].value;
    const sessions = parseInt(row.metricValues[0].value) || 0;
    const users    = parseInt(row.metricValues[1].value) || 0;
    const conversions = parseFloat(row.metricValues[2].value) || 0;
    const revenue  = parseFloat(row.metricValues[3].value) || 0;

    // Match to known AI source
    const aiSource = AI_SOURCES.find(s => source.includes(s.domain.split(".")[0]));
    const sourceId = aiSource?.id || "other";
    const sourceName = aiSource?.name || source;

    if (!bySource[sourceId]) bySource[sourceId] = { id: sourceId, name: sourceName, sessions: 0, users: 0, conversions: 0, revenue: 0, color: aiSource?.color || "#6B7280", icon: aiSource?.icon || "🔗" };
    bySource[sourceId].sessions    += sessions;
    bySource[sourceId].users       += users;
    bySource[sourceId].conversions += conversions;
    bySource[sourceId].revenue     += revenue;

    // Timeline
    if (!timeline[date]) timeline[date] = { date, total: 0 };
    timeline[date].total += sessions;
    timeline[date][sourceId] = (timeline[date][sourceId] || 0) + sessions;
  }

  // Process top pages
  const topPages = [];
  for (const row of (pageData.rows || [])) {
    const source   = row.dimensionValues[0].value;
    const path     = row.dimensionValues[1].value;
    const sessions = parseInt(row.metricValues[0].value) || 0;
    const aiSource = AI_SOURCES.find(s => source.includes(s.domain.split(".")[0]));

    topPages.push({ path, source: aiSource?.name || source, sessions, icon: aiSource?.icon || "🔗" });
  }

  // Sort and finalize
  const sources = Object.values(bySource).sort((a, b) => b.sessions - a.sessions);
  const timelineArr = Object.values(timeline).sort((a, b) => a.date.localeCompare(b.date));
  const totalSessions   = sources.reduce((n, s) => n + s.sessions, 0);
  const totalUsers      = sources.reduce((n, s) => n + s.users, 0);
  const totalRevenue    = sources.reduce((n, s) => n + s.revenue, 0);
  const totalConversions = sources.reduce((n, s) => n + s.conversions, 0);

  return {
    sources,
    timeline: timelineArr,
    topPages: topPages.slice(0, 20),
    totals: { sessions: totalSessions, users: totalUsers, revenue: totalRevenue, conversions: totalConversions },
    propertyName: settings.property_name || propertyId,
    days,
    fetchedAt: new Date().toISOString(),
  };
}
