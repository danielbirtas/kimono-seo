// app/lib/seo/bing-webmaster.server.js
// Bing Webmaster API wrappers — uses OAuth Bearer tokens.

import { getValidBingToken } from "./bing-oauth.server.js";

const API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

async function bingFetch(storeId, method, opts = {}) {
  const token = await getValidBingToken(storeId);
  const url   = `${API_BASE}/${method}${opts.query ? "?" + new URLSearchParams(opts.query).toString() : ""}`;
  const resp  = await fetch(url, {
    method:  opts.method || "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type":  "application/json",
      "Accept":        "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Bing ${method} ${resp.status}: ${txt.slice(0, 300)}`);
  }
  return resp.json();
}

export async function listBingUserSites(storeId) {
  const data = await bingFetch(storeId, "GetUserSites");
  // Response shape: { d: [ {Url, Verified, ...}, ... ] } — older WCF format
  const items = data?.d || [];
  return items.map(s => ({
    url:        s.Url,
    verified:   !!s.IsVerified,
    dateAdded:  s.DateAdded,
  }));
}

export async function getBingUrlSubmissionQuota(storeId, siteUrl) {
  const data = await bingFetch(storeId, "GetUrlSubmissionQuota", { query: { siteUrl } });
  // Response: { d: { DailyQuota, MonthlyQuota } }
  return {
    dailyQuota:   data?.d?.DailyQuota   || 0,
    monthlyQuota: data?.d?.MonthlyQuota || 0,
  };
}

export async function submitBingUrl(storeId, siteUrl, url) {
  // POST SubmitUrl with body { siteUrl, url }
  const data = await bingFetch(storeId, "SubmitUrl", {
    method: "POST",
    body: { siteUrl, url },
  });
  return data;
}

export async function submitBingUrlBatch(storeId, siteUrl, urlList) {
  if (!Array.isArray(urlList) || urlList.length === 0) throw new Error("urlList must be a non-empty array");
  if (urlList.length > 500) throw new Error("Max 500 URLs per batch");
  const data = await bingFetch(storeId, "SubmitUrlBatch", {
    method: "POST",
    body: { siteUrl, urlList },
  });
  return { submitted: urlList.length, response: data };
}

export async function fetchBingRankAndTrafficStats(storeId, siteUrl) {
  // Returns 6 months of daily clicks/impressions
  const data = await bingFetch(storeId, "GetRankAndTrafficStats", { query: { siteUrl } });
  return data?.d || [];
}

export async function fetchBingTopQueries(storeId, siteUrl) {
  const data = await bingFetch(storeId, "GetQueryStats", { query: { siteUrl } });
  return data?.d || [];
}
