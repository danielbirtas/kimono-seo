// app/lib/seo/crawl-budget.server.js
// Kimono SEO #22 — Crawl Budget Optimizer
// Identifies low-value pages wasting Googlebot crawl budget

import prisma from "../../db.server.js";

// ─── GSC Auth ─────────────────────────────────────────────────────────────────
async function getGscToken(storeId) {
  const [tokenSetting, siteSetting] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "seo_gsc_refresh_token" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "seo_gsc_site_url" } } }),
  ]);
  if (!tokenSetting?.value) return null;
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: tokenSetting.value,
      client_id:     process.env.GSC_CLIENT_ID     || "",
      client_secret: process.env.GSC_CLIENT_SECRET || "",
      grant_type:    "refresh_token",
    }),
  });
  const data = await resp.json();
  if (!data.access_token) return null;
  return { accessToken: data.access_token, siteUrl: siteSetting?.value || "" };
}

// ─── Fetch GSC page data (impressions per URL) ────────────────────────────────
async function fetchGscPages(accessToken, siteUrl, days = 180) {
  const end   = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);

  const resp = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method:  "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify({
        startDate:  start.toISOString().split("T")[0],
        endDate:    end.toISOString().split("T")[0],
        dimensions: ["page"],
        rowLimit:   5000,
        dataState:  "final",
      }),
    }
  );
  const data = await resp.json();
  const rows = data.rows || [];

  // Build map: url → { clicks, impressions, position }
  const map = {};
  for (const row of rows) {
    const url = row.keys?.[0] || "";
    if (url) map[url] = {
      clicks:      row.clicks      || 0,
      impressions: row.impressions || 0,
      position:    Math.round((row.position || 99) * 10) / 10,
    };
  }
  return map;
}

// ─── Classify a URL ───────────────────────────────────────────────────────────
function classifyUrl(url, gscData) {
  const urlObj  = (() => { try { return new URL(url); } catch { return null; } })();
  if (!urlObj) return null;

  const path    = urlObj.pathname;
  const params  = urlObj.searchParams;
  const hasParams = [...params.keys()].length > 0;
  const gsc     = gscData[url] || { clicks: 0, impressions: 0, position: 99 };

  // ── Shopify-specific patterns ──────────────────────────────────────────────

  // 1. Filter/sort URLs — Shopify auto-generates these
  const shopifyFilterParams = ["sort_by", "filter.", "constraint", "pf_", "pfx_"];
  const isFilterUrl = hasParams && shopifyFilterParams.some(p =>
    [...params.keys()].some(k => k.startsWith(p) || k === p.replace(".", ""))
  );
  if (isFilterUrl) return {
    category: "filter_url",
    severity: "high",
    reason:   "Shopify-generated filter/sort URL — duplicate content, no unique SEO value",
    action:   "noindex",
    canAutoFix: true,
  };

  // 2. Variant URLs (?variant=XXXXX)
  if (params.has("variant")) return {
    category: "variant_url",
    severity: "high",
    reason:   "Product variant URL — content identical to main product page",
    action:   "canonical",
    canAutoFix: true,
  };

  // 3. Pagination beyond page 2 (?page=N where N > 2)
  const pageNum = parseInt(params.get("page") || "0");
  if (pageNum > 2) return {
    category: "deep_pagination",
    severity: "medium",
    reason:   `Deep pagination (page ${pageNum}) — low traffic, waste of crawl budget`,
    action:   "noindex",
    canAutoFix: true,
  };

  // 4. Internal search results
  if (path.includes("/search") && hasParams) return {
    category: "search_results",
    severity: "high",
    reason:   "Internal search results page — infinite URL space, no SEO value",
    action:   "noindex",
    canAutoFix: true,
  };

  // 5. Preview / draft pages
  if (params.has("preview_key") || params.has("_token") || params.has("preview")) return {
    category: "preview_page",
    severity: "high",
    reason:   "Preview/draft URL — should never be indexed",
    action:   "noindex",
    canAutoFix: true,
  };

  // 6. Zero GSC data + not a core page — low-value content
  if (gsc.impressions === 0 && gsc.clicks === 0) {
    if (path.startsWith("/blogs/") && path.split("/").length > 3) return {
      category: "zero_traffic_article",
      severity: "low",
      reason:   "Article with zero impressions in 6 months — review if worth keeping",
      action:   "review",
      canAutoFix: false,
    };
    if (path.startsWith("/products/") && !hasParams) return {
      category: "zero_traffic_product",
      severity: "low",
      reason:   "Product page with zero impressions in 6 months — may be out of stock or low demand",
      action:   "review",
      canAutoFix: false,
    };
  }

  // 7. Very poor performing pages (high impressions, near-zero CTR, position > 50)
  if (gsc.impressions > 100 && gsc.clicks === 0 && gsc.position > 50) return {
    category: "poor_performer",
    severity: "medium",
    reason:   `${gsc.impressions} impressions, 0 clicks, avg position #${gsc.position} — not relevant to searchers`,
    action:   "improve_or_noindex",
    canAutoFix: false,
  };

  return null; // page is fine
}

// ─── AI Analysis ──────────────────────────────────────────────────────────────
async function getAiRecommendations(summary) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001";

  const prompt = `You are a Shopify SEO expert analyzing crawl budget waste. Given this audit summary, provide actionable recommendations.

AUDIT SUMMARY:
- Total pages analyzed: ${summary.totalAnalyzed}
- Filter/sort URLs found: ${summary.byCategory.filter_url || 0}
- Variant URLs: ${summary.byCategory.variant_url || 0}
- Deep pagination: ${summary.byCategory.deep_pagination || 0}
- Search result pages: ${summary.byCategory.search_results || 0}
- Zero traffic articles: ${summary.byCategory.zero_traffic_article || 0}
- Zero traffic products: ${summary.byCategory.zero_traffic_product || 0}
- Poor performers: ${summary.byCategory.poor_performer || 0}
- High severity issues: ${summary.bySeverity.high || 0}
- Medium severity issues: ${summary.bySeverity.medium || 0}

Respond with ONLY valid JSON, no markdown, no special characters, plain ASCII only:
{"priorityActions":["Action 1 to take first","Action 2","Action 3"],"robotsTxtRules":["Disallow: /collections/*?sort_by=*","Add more rules here"],"estimatedImpact":"One sentence about expected improvement","shopifyNote":"One specific Shopify tip"}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body:    JSON.stringify({
      model,
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await resp.json();
  const text = (data.content?.[0]?.text || "").replace(/[^\x20-\x7E]/g, " ");
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

// ─── Fetch all pages from Shopify sitemap + GSC ───────────────────────────────
async function collectUrls(storeId, shopDomain, accessToken, siteUrl) {
  const urls = new Set();

  // 1. From GSC — pages Google has crawled
  if (accessToken && siteUrl) {
    const gscMap = await fetchGscPages(accessToken, siteUrl);
    Object.keys(gscMap).forEach(u => urls.add(u));
    console.log(`[Crawl] GSC pages: ${urls.size}`);
  }

  // 2. From Shopify — products, collections, articles
  const session = await prisma.session.findFirst({ where: { shop: shopDomain } });
  if (session?.accessToken) {
    const baseUrl = siteUrl?.replace(/\/$/, "") || `https://${shopDomain}`;

    // Add known Shopify URL patterns that generate duplicates
    const extraPatterns = [
      `${baseUrl}/collections/all?sort_by=price-ascending`,
      `${baseUrl}/collections/all?sort_by=price-descending`,
      `${baseUrl}/collections/all?sort_by=best-selling`,
      `${baseUrl}/search?q=*`,
    ];
    extraPatterns.forEach(u => urls.add(u));
  }

  return [...urls];
}

// ─── Main audit ───────────────────────────────────────────────────────────────
export async function runCrawlBudgetAudit(storeId, shopDomain) {
  console.log(`[Crawl] Starting audit for ${shopDomain}`);

  // Get GSC token
  const gscAuth = await getGscToken(storeId);
  const gscData = gscAuth
    ? await fetchGscPages(gscAuth.accessToken, gscAuth.siteUrl)
    : {};

  console.log(`[Crawl] GSC pages with data: ${Object.keys(gscData).length}`);

  // Collect all URLs
  const allUrls = await collectUrls(storeId, shopDomain, gscAuth?.accessToken, gscAuth?.siteUrl);
  console.log(`[Crawl] Total URLs to analyze: ${allUrls.length}`);

  // Classify each URL
  const issues = [];
  for (const url of allUrls) {
    const classification = classifyUrl(url, gscData);
    if (classification) {
      issues.push({
        url,
        ...classification,
        gsc: gscData[url] || { clicks: 0, impressions: 0, position: 99 },
      });
    }
  }

  // Sort: high severity first, then by impressions desc
  const sevOrder = { high: 3, medium: 2, low: 1 };
  issues.sort((a, b) => {
    if (sevOrder[b.severity] !== sevOrder[a.severity]) return sevOrder[b.severity] - sevOrder[a.severity];
    return (b.gsc?.impressions || 0) - (a.gsc?.impressions || 0);
  });
  
  // Ensure we keep a representative sample of each severity
  const highIssues   = issues.filter(i => i.severity === "high").slice(0, 400);
  const mediumIssues = issues.filter(i => i.severity === "medium").slice(0, 400);
  const lowIssues    = issues.filter(i => i.severity === "low").slice(0, 200);
  const sortedIssues = [...highIssues, ...mediumIssues, ...lowIssues];

  // Build summary
  const byCategory = {};
  const bySeverity = {};
  for (const issue of issues) {
    byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
    bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
  }

  const autoFixable = issues.filter(i => i.canAutoFix).length;
  const summary = {
    totalAnalyzed: allUrls.length,
    totalIssues:   issues.length,
    autoFixable,
    byCategory,
    bySeverity,
  };

  // Generate robots.txt rules
  const robotsRules = generateRobotsRules(issues);

  // AI recommendations
  const aiRec = await getAiRecommendations(summary);

  const result = {
    shopDomain,
    siteUrl:    gscAuth?.siteUrl || "",
    summary,
    issues:     sortedIssues,
    robotsRules,
    aiRecommendations: aiRec,
    hasGsc:     !!gscAuth,
    analyzedAt: new Date().toISOString(),
  };

  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: "crawl_budget_results" } },
    create: { storeId, key: "crawl_budget_results", value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });

  console.log(`[Crawl] Done — ${issues.length} issues (${autoFixable} auto-fixable)`);
  console.log(`[Crawl] By severity:`, JSON.stringify(bySeverity));
  console.log(`[Crawl] By category:`, JSON.stringify(byCategory));
  return result;
}

// ─── Generate robots.txt rules ────────────────────────────────────────────────
function generateRobotsRules(issues) {
  const rules = new Set();

  const hasFilterUrls    = issues.some(i => i.category === "filter_url");
  const hasVariantUrls   = issues.some(i => i.category === "variant_url");
  const hasSearchUrls    = issues.some(i => i.category === "search_results");
  const hasPaginationUrls = issues.some(i => i.category === "deep_pagination");

  if (hasFilterUrls) {
    rules.add("Disallow: /*?sort_by=*");
    rules.add("Disallow: /*?filter.*");
    rules.add("Disallow: /*?pf_*");
  }
  if (hasVariantUrls)    rules.add("Disallow: /*?variant=*");
  if (hasSearchUrls)     rules.add("Disallow: /search?*");
  if (hasPaginationUrls) rules.add("Disallow: /*?page=*");

  // Always recommend these for Shopify
  rules.add("Disallow: /admin");
  rules.add("Disallow: /cart");
  rules.add("Disallow: /checkout");
  rules.add("Disallow: /orders");
  rules.add("Disallow: /account");

  return [...rules];
}

export async function getCrawlBudgetResults(storeId) {
  const s = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "crawl_budget_results" } },
  });
  if (!s?.value) return null;
  try { return JSON.parse(s.value); } catch { return null; }
}

export async function applyRobotsTxt(storeId, shopDomain, rules) {
  // Get current robots.txt from Shopify
  const session = await prisma.session.findFirst({ where: { shop: shopDomain } });
  if (!session?.accessToken) throw new Error("No Shopify session");

  // Get main theme
  const themeResp = await fetch(
    `https://${shopDomain}/admin/api/2025-04/themes.json`,
    { headers: { "X-Shopify-Access-Token": session.accessToken } }
  );
  const themeData = await themeResp.json();
  const mainTheme = themeData.themes?.find(t => t.role === "main");
  if (!mainTheme) throw new Error("Main theme not found");

  // Get current robots.txt.liquid
  const assetResp = await fetch(
    `https://${shopDomain}/admin/api/2025-04/themes/${mainTheme.id}/assets.json?asset[key]=templates/robots.txt.liquid`,
    { headers: { "X-Shopify-Access-Token": session.accessToken } }
  );

  let robotsContent = "";
  if (assetResp.ok) {
    const assetData = await assetResp.json();
    robotsContent = assetData.asset?.value || "";
  }

  // Add Kimono SEO rules section
  const marker     = "# Kimono SEO Crawl Budget Rules";
  const endMarker  = "# /Kimono SEO";

  // Remove existing Kimono SEO block
  const start = robotsContent.indexOf(marker);
  const end   = robotsContent.indexOf(endMarker);
  if (start !== -1 && end !== -1) {
    robotsContent = robotsContent.slice(0, start) + robotsContent.slice(end + endMarker.length);
  }

  // Append new rules
  const rulesBlock = `\n${marker}\nUser-agent: *\n${rules.join("\n")}\n${endMarker}\n`;
  robotsContent = (robotsContent || "{% comment %} Robots.txt {% endcomment %}\n") + rulesBlock;

  // Save back
  const saveResp = await fetch(
    `https://${shopDomain}/admin/api/2025-04/themes/${mainTheme.id}/assets.json`,
    {
      method:  "PUT",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": session.accessToken },
      body:    JSON.stringify({ asset: { key: "templates/robots.txt.liquid", value: robotsContent } }),
    }
  );
  if (!saveResp.ok) throw new Error(`Failed to save robots.txt: ${saveResp.status}`);
  return { success: true, rulesApplied: rules.length };
}
