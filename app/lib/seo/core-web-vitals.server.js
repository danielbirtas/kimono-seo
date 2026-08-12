// app/lib/seo/core-web-vitals.server.js
// Kimono SEO #25 — Core Web Vitals Monitor via PageSpeed Insights API

import prisma from "../../db.server.js";

const PSI_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PSI_KEY = process.env.PAGESPEED_API_KEY || ""; // optional — works without key but rate-limited

async function fetchPsi(url, strategy = "mobile") {
  const params = new URLSearchParams({ url, strategy, category: "performance" });
  if (PSI_KEY) params.set("key", PSI_KEY);

  // Hard timeout on PSI — real PSI calls take 30-45s; give them 50s before abort
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  let resp;
  try {
    resp = await fetch(`${PSI_API}?${params}`, { signal: ctrl.signal });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new Error(`PSI timeout pentru ${url} (${strategy})`);
    throw e;
  }
  clearTimeout(timer);
  const data = await resp.json();

  if (data.error) {
    const msg = data.error.message || "PSI error";
    if (msg.includes("Quota")) throw new Error(`PSI quota exceeded — add PAGESPEED_API_KEY to Railway env vars (free, 25k queries/day from Google Cloud Console)`);
    throw new Error(`PSI error: ${msg}`);
  }

  const cats    = data.lighthouseResult?.categories?.performance;
  const audits  = data.lighthouseResult?.audits || {};
  const metrics = data.lighthouseResult?.audits;

  // Core Web Vitals
  const lcp  = metrics?.["largest-contentful-paint"]?.numericValue || null;   // ms
  const fid  = metrics?.["max-potential-fid"]?.numericValue || null;           // ms (proxy for INP)
  const cls  = metrics?.["cumulative-layout-shift"]?.numericValue || null;     // score
  const fcp  = metrics?.["first-contentful-paint"]?.numericValue || null;      // ms
  const ttfb = metrics?.["server-response-time"]?.numericValue || null;        // ms
  const tbt  = metrics?.["total-blocking-time"]?.numericValue || null;         // ms
  const si   = metrics?.["speed-index"]?.numericValue || null;                 // ms

  // Score
  const score = Math.round((cats?.score || 0) * 100);

  // Status per metric (Google thresholds)
  function lcpStatus(v)  { return !v ? "n/a" : v <= 2500 ? "good" : v <= 4000 ? "needs_improvement" : "poor"; }
  function clsStatus(v)  { return !v ? "n/a" : v <= 0.1  ? "good" : v <= 0.25 ? "needs_improvement" : "poor"; }
  function fcpStatus(v)  { return !v ? "n/a" : v <= 1800 ? "good" : v <= 3000 ? "needs_improvement" : "poor"; }
  function ttfbStatus(v) { return !v ? "n/a" : v <= 800  ? "good" : v <= 1800 ? "needs_improvement" : "poor"; }
  function tbtStatus(v)  { return !v ? "n/a" : v <= 200  ? "good" : v <= 600  ? "needs_improvement" : "poor"; }

  return {
    url,
    strategy,
    score,
    lcp:  { value: lcp  ? Math.round(lcp)  : null, unit: "ms",    status: lcpStatus(lcp),   label: "LCP" },
    cls:  { value: cls  ? Math.round(cls * 1000) / 1000 : null, unit: "", status: clsStatus(cls),   label: "CLS" },
    fcp:  { value: fcp  ? Math.round(fcp)  : null, unit: "ms",    status: fcpStatus(fcp),   label: "FCP" },
    ttfb: { value: ttfb ? Math.round(ttfb) : null, unit: "ms",    status: ttfbStatus(ttfb), label: "TTFB" },
    tbt:  { value: tbt  ? Math.round(tbt)  : null, unit: "ms",    status: tbtStatus(tbt),   label: "TBT" },
    opportunities: Object.values(audits)
      .filter(a => a.details?.type === "opportunity" && a.numericValue > 0)
      .sort((a, b) => (b.numericValue || 0) - (a.numericValue || 0))
      .slice(0, 5)
      .map(a => ({ title: a.title, savings: Math.round(a.numericValue), description: a.description })),
  };
}

// ─── AI Recommendations ───────────────────────────────────────────────────────
async function generateCwvRecommendations(auditResult) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No Anthropic API key");

  const model = process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6";

  // Summarize audit for Claude
  const pageSummaries = auditResult.pages
    .filter(p => p.mobile || p.desktop)
    .map(p => {
      const m = p.mobile;
      const d = p.desktop;
      const path = p.url.replace(/https?:\/\/[^/]+/, "") || "/";
      return `Page: ${path}
  Mobile: score=${m?.score ?? "N/A"} | LCP=${m?.lcp?.value ?? "N/A"}ms(${m?.lcp?.status ?? "N/A"}) | CLS=${m?.cls?.value ?? "N/A"}(${m?.cls?.status ?? "N/A"}) | TBT=${m?.tbt?.value ?? "N/A"}ms(${m?.tbt?.status ?? "N/A"}) | TTFB=${m?.ttfb?.value ?? "N/A"}ms(${m?.ttfb?.status ?? "N/A"})
  Desktop: score=${d?.score ?? "N/A"} | LCP=${d?.lcp?.value ?? "N/A"}ms | TBT=${d?.tbt?.value ?? "N/A"}ms
  Top opportunities: ${(m?.opportunities || []).map(o => `${o.title}(${o.savings}ms saved)`).join(", ") || "none"}`;
    }).join("\n\n");

  const prompt = `You are a Shopify performance expert. Analyze this Core Web Vitals audit and provide recommendations.

AUDIT:
${pageSummaries}

Respond with ONLY a valid JSON object. No markdown, no code blocks, no special characters. Use only plain ASCII text in all string values. No apostrophes in values - use "don't" not "don't". Keep all strings under 200 characters.

{"overallAssessment":"2-3 sentence summary of performance and main issues","priorityIssues":[{"metric":"TBT","severity":"critical","title":"Short title","explanation":"Why this hurts performance","shopifyFix":"Specific Shopify fix","estimatedImpact":"Expected improvement"}],"quickWins":["Action 1","Action 2","Action 3"],"shopifySpecificTips":["Tip 1","Tip 2","Tip 3"]}

Replace the example values with real analysis. Return ONLY the JSON, nothing else.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body:    JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await resp.json();
  const text = data.content?.[0]?.text || "";

  // Parse JSON from response - handle markdown code blocks and special chars
  let jsonText = text;
  // Strip markdown code blocks
  jsonText = jsonText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  // Extract JSON object
  const start = jsonText.indexOf("{");
  const end   = jsonText.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in AI response");
  jsonText = jsonText.slice(start, end + 1);
  try {
    return JSON.parse(jsonText);
  } catch (parseErr) {
    console.error("[CWV] JSON parse failed at position", parseErr.message);
    console.error("[CWV] JSON around error:", jsonText.slice(4600, 4800));
    // Try aggressive sanitization - remove all non-ASCII and control chars
    const sanitized = jsonText
      .replace(/[^\x20-\x7E]/g, " ")   // keep only printable ASCII
      .replace(/,\s*([}\]])/g, "$1")    // remove trailing commas
      .replace(/([{,]\s*)"([^"]+)"\s*:/g, (m) => m);  // keep key structure
    return JSON.parse(sanitized);
  }
}

export async function runCwvAudit(storeId, shopDomain) {
  const [gscSite, brandDomainSetting] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "seo_gsc_site_url" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "brand_domain" } } }),
  ]);

  // Priority: brand_domain setting (set in Brand SERP) → GSC site URL → Shopify myshopify domain
  const siteUrl = (brandDomainSetting?.value || gscSite?.value || "").replace(/\/+$/, "")
    || `https://${shopDomain}`;
  console.log(`[CWV] Using domain: ${siteUrl} (brand=${brandDomainSetting?.value} gsc=${gscSite?.value})`);

  // URLs to audit: homepage + top pages from GSC
  const urlsToAudit = [siteUrl];

  // Get top pages from GSC triage results + popular collections
  try {
    const topGsc = await prisma.gscTriageResult.findMany({
      where: { storeId },
      orderBy: { clicks: "desc" },
      take: 9,
      select: { keyword: true },
    });
    // Build URLs from top keywords - check if they map to known pages
    // Also add common high-traffic page types
    const commonPaths = ["/collections", "/products", "/blogs/news"];
    commonPaths.forEach(p => {
      const full = siteUrl + p;
      if (!urlsToAudit.includes(full)) urlsToAudit.push(full);
    });
  } catch {}

  // Cap at 10 URLs — PSI takes 15-25s per URL/strategy × 2 strategies = risk of HTTP timeout
  const capped = urlsToAudit.slice(0, 10);
  console.log(`[CWV] Auditing ${capped.length} URLs for ${siteUrl}`);

  const pages = [];

  for (const url of capped) {
    try {
      console.log(`[CWV] Checking ${url}`);
      const [mobile, desktop] = await Promise.all([
        fetchPsi(url, "mobile").catch(e => ({ error: e.message })),
        fetchPsi(url, "desktop").catch(e => ({ error: e.message })),
      ]);
      pages.push({ url, mobile, desktop });
    } catch (e) {
      console.warn(`[CWV] Failed for ${url}:`, e.message);
      pages.push({ url, error: e.message });
    }
  }

  const result = {
    siteUrl,
    pages,
    auditedAt: new Date().toISOString(),
    summary: {
      avgMobileScore:  Math.round(pages.filter(p => p.mobile?.score != null).reduce((s, p) => s + (p.mobile.score || 0), 0) / Math.max(pages.filter(p => p.mobile?.score != null).length, 1)),
      avgDesktopScore: Math.round(pages.filter(p => p.desktop?.score != null).reduce((s, p) => s + (p.desktop.score || 0), 0) / Math.max(pages.filter(p => p.desktop?.score != null).length, 1)),
      pagesAudited: pages.length,
    },
  };

  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: "cwv_results" } },
    create: { storeId, key: "cwv_results", value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });

  console.log(`[CWV] Done — ${pages.length} pages | avg mobile: ${result.summary.avgMobileScore} | avg desktop: ${result.summary.avgDesktopScore}`);

  // Generate AI recommendations
  try {
    const aiRec = await generateCwvRecommendations(result);
    result.aiRecommendations = aiRec;
    // Save updated result with AI recommendations
    await prisma.seoSetting.upsert({
      where:  { storeId_key: { storeId, key: "cwv_results" } },
      create: { storeId, key: "cwv_results", value: JSON.stringify(result) },
      update: { value: JSON.stringify(result) },
    });
  } catch (e) {
    console.error("[CWV] AI recommendations failed:", e.message, e.stack?.split("\n")[1]);
  }

  return result;
}

export async function getCwvResults(storeId) {
  const s = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "cwv_results" } },
  });
  if (!s?.value) return null;
  try { return JSON.parse(s.value); } catch { return null; }
}
