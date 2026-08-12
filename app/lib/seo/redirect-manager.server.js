// app/lib/seo/redirect-manager.server.js
// Kimono SEO #05 — Redirect Manager
// Detects 404s via GSC + Shopify sitemap, suggests destinations, auto-applies high-confidence ones

import prisma from "../../db.server.js";

const MODEL_FAST = process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001";

// ─── Claude helper ───────────────────────────────────────────────────────────
async function claudeFetch(prompt, maxTokens = 800) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL_FAST,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await resp.json();
  return data.content?.[0]?.text || "";
}

// ─── Fetch 404s from GSC ─────────────────────────────────────────────────────
async function fetch404sFromGSC(accessToken, siteUrl, days = 28) {
  const endDate   = new Date();
  const startDate = new Date(Date.now() - days * 86400000);
  const fmt = d => d.toISOString().split("T")[0];

  try {
    const resp = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ["page"],
          dimensionFilterGroups: [{
            filters: [{ dimension: "page", operator: "contains", expression: "" }]
          }],
          rowLimit: 500,
          dataState: "all",
        }),
      }
    );
    const data = await resp.json();
    return data.rows || [];
  } catch (e) {
    console.warn("[Redirect] GSC fetch failed:", e.message);
    return [];
  }
}

// ─── Fetch URL inspection (check if 404) ─────────────────────────────────────
async function checkUrl404(url, accessToken, siteUrl) {
  try {
    const resp = await fetch(
      `https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`,
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionUrl: url, siteUrl }),
      }
    );
    const data = await resp.json();
    const verdict = data.inspectionResult?.indexStatusResult?.verdict;
    const httpCode = data.inspectionResult?.indexStatusResult?.lastHttpStatusCode;
    return httpCode === 404 || verdict === "EXCLUDED";
  } catch {
    return false;
  }
}

// ─── Fetch all known URLs from Shopify ───────────────────────────────────────
async function fetchKnownUrls(accessToken, shopDomain) {
  const urls = new Set();
  const baseUrl = `https://${shopDomain}`;

  try {
    // Products
    let page = `https://${shopDomain}/admin/api/2025-04/products.json?fields=handle&limit=250`;
    while (page) {
      const r = await fetch(page, { headers: { "X-Shopify-Access-Token": accessToken } });
      const d = await r.json();
      (d.products || []).forEach(p => urls.add(`${baseUrl}/products/${p.handle}`));
      const link = r.headers.get("Link") || "";
      const next = link.match(/<([^>]+)>;\s*rel="next"/)?.[1];
      page = next || null;
    }
  } catch {}

  try {
    // Collections
    const r = await fetch(`https://${shopDomain}/admin/api/2025-04/custom_collections.json?fields=handle&limit=250`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    const d = await r.json();
    (d.custom_collections || []).forEach(c => urls.add(`${baseUrl}/collections/${c.handle}`));
  } catch {}

  try {
    // Pages
    const r = await fetch(`https://${shopDomain}/admin/api/2025-04/pages.json?fields=handle&limit=250`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    const d = await r.json();
    (d.pages || []).forEach(p => urls.add(`${baseUrl}/pages/${p.handle}`));
  } catch {}

  try {
    // Blog articles
    const r = await fetch(`https://${shopDomain}/admin/api/2025-04/articles.json?fields=handle&limit=250`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    const d = await r.json();
    (d.articles || []).forEach(a => urls.add(`${baseUrl}/blogs/news/${a.handle}`));
  } catch {}

  return urls;
}

// ─── AI: suggest best redirect destination ───────────────────────────────────
async function suggestDestination(brokenPath, knownUrls, shopDomain) {
  const candidates = [...knownUrls]
    .map(u => u.replace(`https://${shopDomain}`, ""))
    .filter(p => {
      // Filter candidates that share some path segments with broken URL
      const brokenParts = brokenPath.toLowerCase().split(/[-/]/);
      const candidateParts = p.toLowerCase().split(/[-/]/);
      return brokenParts.some(part => part.length > 3 && candidateParts.some(cp => cp.includes(part) || part.includes(cp)));
    })
    .slice(0, 20);

  if (candidates.length === 0) {
    // Fallback: guess from path structure
    if (brokenPath.includes("/products/")) return { toPath: "/collections/all", confidence: 30, reason: "Product not found — redirecting to all products" };
    if (brokenPath.includes("/collections/")) return { toPath: "/collections/all", confidence: 40, reason: "Collection not found — redirecting to all collections" };
    if (brokenPath.includes("/blogs/")) return { toPath: "/blogs/news", confidence: 40, reason: "Article not found — redirecting to blog" };
    return { toPath: "/", confidence: 20, reason: "No matching page found — redirecting to homepage" };
  }

  const prompt = `A Shopify store has a broken URL (404). Find the best redirect destination.

Broken URL path: ${brokenPath}

Available URLs to redirect to:
${candidates.join("\n")}

Rules:
- Match by topic/keywords in the URL slug
- Prefer specific pages over generic ones (e.g. /products/red-shoes over /collections/all)
- If no good match, use /collections/all or /blogs/news

Output ONLY valid JSON (no markdown):
{"toPath": "/best/matching/path", "confidence": 85, "reason": "one sentence explanation"}`;

  try {
    const text = await claudeFetch(prompt, 200);
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { toPath: candidates[0] || "/", confidence: 35, reason: "Best available match" };
  }
}

// ─── Main scan function ───────────────────────────────────────────────────────
export async function scanForRedirects(storeId, accessToken, shopDomain) {
  console.log(`[Redirect] Scanning ${shopDomain}`);

  // Get GSC settings
  const gscTokenSetting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "seo_gsc_refresh_token" } },
  });
  const gscSiteUrlSetting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "seo_gsc_site_url" } },
  });

  // Fetch known URLs from Shopify
  const knownUrls = await fetchKnownUrls(accessToken, shopDomain);
  console.log(`[Redirect] Known URLs: ${knownUrls.size}`);

  let brokenUrls = [];

  // Source 1: GSC (if connected)
  if (gscTokenSetting?.value && gscSiteUrlSetting?.value) {
    try {
      // Get a fresh access token using the refresh token
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: gscTokenSetting.value,
          client_id: process.env.GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          grant_type: "refresh_token",
        }),
      });
      const tokenData = await tokenResp.json();
      const gscAccessToken = tokenData.access_token;

      if (gscAccessToken) {
        const rows = await fetch404sFromGSC(gscAccessToken, gscSiteUrlSetting.value);
        const siteUrl = gscSiteUrlSetting.value.replace(/\/$/, "");

        // Filter rows where the URL is NOT in knownUrls (= likely 404)
        for (const row of rows) {
          const pageUrl = row.keys?.[0] || "";
          if (!pageUrl) continue;
          const path = pageUrl.replace(siteUrl, "").replace(/^https?:\/\/[^/]+/, "");
          if (path && !knownUrls.has(pageUrl) && !knownUrls.has(`https://${shopDomain}${path}`)) {
            brokenUrls.push({
              path,
              clicks: row.clicks || 0,
              impressions: row.impressions || 0,
              source: "gsc",
            });
          }
        }
        console.log(`[Redirect] GSC broken URLs found: ${brokenUrls.length}`);
      }
    } catch (e) {
      console.warn("[Redirect] GSC error:", e.message);
    }
  }

  // Source 2: Crawl sitemap if no GSC or insufficient data
  if (brokenUrls.length < 5) {
    try {
      const sitemapResp = await fetch(`https://${shopDomain}/sitemap.xml`);
      const sitemapText = await sitemapResp.text();
      const sitemapUrls = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

      for (const url of sitemapUrls) {
        if (!knownUrls.has(url)) {
          const path = url.replace(/^https?:\/\/[^/]+/, "");
          if (path && !brokenUrls.find(b => b.path === path)) {
            // Quick HTTP check
            try {
              const checkResp = await fetch(url, { method: "HEAD", redirect: "manual" });
              if (checkResp.status === 404) {
                brokenUrls.push({ path, clicks: 0, impressions: 0, source: "sitemap" });
              }
            } catch {}
          }
        }
      }
      console.log(`[Redirect] After sitemap crawl: ${brokenUrls.length} broken URLs`);
    } catch (e) {
      console.warn("[Redirect] Sitemap crawl failed:", e.message);
    }
  }

  // Dedupe and sort by clicks (highest impact first)
  brokenUrls = brokenUrls
    .filter((v, i, a) => a.findIndex(x => x.path === v.path) === i)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 100); // max 100 per scan

  // Generate suggestions for each broken URL
  let created = 0, skipped = 0;
  for (const broken of brokenUrls) {
    // Skip if already have a suggestion
    const existing = await prisma.redirectSuggestion.findUnique({
      where: { storeId_fromPath: { storeId, fromPath: broken.path } },
    });
    if (existing?.status === "applied") { skipped++; continue; }

    const suggestion = await suggestDestination(broken.path, knownUrls, shopDomain);

    await prisma.redirectSuggestion.upsert({
      where: { storeId_fromPath: { storeId, fromPath: broken.path } },
      create: {
        storeId,
        fromPath: broken.path,
        toPath: suggestion.toPath,
        confidence: suggestion.confidence,
        reason: suggestion.reason,
        source: broken.source,
        clicks: broken.clicks,
        impressions: broken.impressions,
        status: "pending",
      },
      update: {
        toPath: suggestion.toPath,
        confidence: suggestion.confidence,
        reason: suggestion.reason,
        clicks: broken.clicks,
        impressions: broken.impressions,
        status: existing?.status === "dismissed" ? "dismissed" : "pending",
      },
    });
    created++;
  }

  console.log(`[Redirect] Scan done — ${created} suggestions, ${skipped} skipped`);
  return { total: brokenUrls.length, created, skipped };
}

// ─── Apply a redirect via Shopify API ────────────────────────────────────────
export async function applyRedirect(storeId, suggestionId, accessToken, shopDomain) {
  const suggestion = await prisma.redirectSuggestion.findUnique({ where: { id: suggestionId } });
  if (!suggestion || suggestion.storeId !== storeId) throw new Error("Suggestion not found");
  if (suggestion.status === "applied") throw new Error("Already applied");

  const resp = await fetch(`https://${shopDomain}/admin/api/2025-04/redirects.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ redirect: { path: suggestion.fromPath, target: suggestion.toPath } }),
  });

  const data = await resp.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));

  const shopifyRedirectId = String(data.redirect?.id || "");
  await prisma.redirectSuggestion.update({
    where: { id: suggestionId },
    data: { status: "applied", appliedAt: new Date(), shopifyRedirectId },
  });

  return { success: true, shopifyRedirectId };
}

// ─── Auto-apply high confidence redirects ────────────────────────────────────
export async function autoApplyHighConfidence(storeId, accessToken, shopDomain, threshold = 80) {
  const pending = await prisma.redirectSuggestion.findMany({
    where: { storeId, status: "pending", confidence: { gte: threshold } },
    orderBy: { confidence: "desc" },
    take: 50,
  });

  let applied = 0, failed = 0;
  for (const s of pending) {
    try {
      await applyRedirect(storeId, s.id, accessToken, shopDomain);
      applied++;
    } catch (e) {
      console.warn(`[Redirect] Auto-apply failed for ${s.fromPath}:`, e.message);
      failed++;
    }
  }

  console.log(`[Redirect] Auto-applied: ${applied}, failed: ${failed}`);
  return { applied, failed };
}

// ─── Get suggestions list ─────────────────────────────────────────────────────
export async function getRedirectSuggestions(storeId, status = "pending") {
  return prisma.redirectSuggestion.findMany({
    where: { storeId, ...(status !== "all" ? { status } : {}) },
    orderBy: [{ confidence: "desc" }, { clicks: "desc" }],
    take: 200,
  });
}

// ─── Dismiss a suggestion ────────────────────────────────────────────────────
export async function dismissRedirect(storeId, suggestionId) {
  return prisma.redirectSuggestion.update({
    where: { id: suggestionId },
    data: { status: "dismissed" },
  });
}

// ─── Stats ───────────────────────────────────────────────────────────────────
export async function getRedirectStats(storeId) {
  const [pending, applied, dismissed] = await Promise.all([
    prisma.redirectSuggestion.count({ where: { storeId, status: "pending" } }),
    prisma.redirectSuggestion.count({ where: { storeId, status: "applied" } }),
    prisma.redirectSuggestion.count({ where: { storeId, status: "dismissed" } }),
  ]);
  const highConfidence = await prisma.redirectSuggestion.count({
    where: { storeId, status: "pending", confidence: { gte: 80 } },
  });
  return { pending, applied, dismissed, highConfidence };
}
