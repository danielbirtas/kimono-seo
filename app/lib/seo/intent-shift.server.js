// app/lib/seo/intent-shift.server.js
// Kimono SEO #26 — Search Intent Shift Detection
// Monitors weekly SERP composition per keyword — detects when Google changes
// what type of content ranks (informational → commercial, product → blog, etc.)

import prisma from "../../db.server.js";

function getDfsAuth() {
  const l = process.env.DATAFORSEO_LOGIN    || "";
  const p = process.env.DATAFORSEO_PASSWORD || "";
  if (!l || !p) return null;
  return Buffer.from(`${l}:${p}`).toString("base64");
}

async function dfsFetch(endpoint, body) {
  const auth = getDfsAuth();
  if (!auth) throw new Error("DataForSEO not configured");
  const resp = await fetch(`https://api.dataforseo.com${endpoint}`, {
    method:  "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const data = await resp.json();
  if (data.status_code !== 20000) throw new Error(`DFS ${data.status_code}: ${data.status_message}`);
  return data;
}

// ─── Classify page type from URL + title ─────────────────────────────────────
function classifyPageType(url, title) {
  const u = (url || "").toLowerCase();
  const t = (title || "").toLowerCase();

  // Shopify / e-commerce patterns
  if (u.includes("/products/") || u.includes("/product/"))      return "product";
  if (u.includes("/collections/") || u.includes("/category/"))  return "category";
  if (u.includes("/blogs/") || u.includes("/blog/") || u.includes("/articol")) return "blog";

  // Generic patterns
  if (u.includes("wikipedia"))     return "informational";
  if (u.includes("youtube.com"))   return "video";
  if (u.includes("reddit.com") || u.includes("forum")) return "forum";

  // Title patterns
  const buyCues  = ["cumpara", "pret", "oferta", "buy", "shop", "price", "order", "comanda"];
  const infoCues = ["ce este", "cum", "ghid", "guide", "what is", "how to", "tutorial", "review", "recenzie"];
  const listCues = ["top ", "cele mai", "best ", "cele ", "lista", "list"];

  if (listCues.some(c => t.includes(c)))  return "listicle";
  if (buyCues.some(c => t.includes(c)))   return "commercial";
  if (infoCues.some(c => t.includes(c)))  return "informational";

  return "other";
}

// ─── Analyze SERP composition for a keyword ──────────────────────────────────
async function analyzeSerpComposition(keyword, locationCode = 2040) {
  const data = await dfsFetch("/v3/serp/google/organic/live/advanced", [{
    keyword,
    location_code: locationCode,
    language_code: "ro",
    device:        "desktop",
    os:            "windows",
    depth:         10,
  }]);

  const items = data.tasks?.[0]?.result?.[0]?.items || [];
  const organic = items.filter(i => i.type === "organic");

  // Count page types in top 10
  const typeCounts = {};
  const pages = [];

  for (const item of organic) {
    const type = classifyPageType(item.url, item.title);
    typeCounts[type] = (typeCounts[type] || 0) + 1;
    pages.push({
      position: item.rank_absolute,
      url:      item.url || "",
      title:    item.title || "",
      type,
      domain:   item.domain || "",
    });
  }

  // Dominant intent = type with most pages in top 10
  const dominant = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "other";

  // SERP features
  const hasShoppingAds  = items.some(i => i.type === "paid");
  const hasFeaturedSnip = items.some(i => i.type === "featured_snippet");
  const hasPaa          = items.some(i => i.type === "people_also_ask");
  const hasVideos       = items.some(i => i.type === "video");

  return {
    keyword,
    dominant,
    typeCounts,
    pages,
    features: { hasShoppingAds, hasFeaturedSnip, hasPaa, hasVideos },
    totalOrganic: organic.length,
    checkedAt: new Date().toISOString(),
  };
}

// ─── Detect shifts between two snapshots ─────────────────────────────────────
function detectShift(previous, current) {
  if (!previous || !current) return null;

  const shifts = [];

  // Dominant intent changed
  if (previous.dominant !== current.dominant) {
    shifts.push({
      type:        "dominant_intent_change",
      severity:    "high",
      description: `Google changed dominant intent from "${previous.dominant}" to "${current.dominant}"`,
      recommendation: getShiftRecommendation(previous.dominant, current.dominant),
    });
  }

  // Individual type distribution changed > 30%
  const allTypes = new Set([
    ...Object.keys(previous.typeCounts || {}),
    ...Object.keys(current.typeCounts || {}),
  ]);

  for (const type of allTypes) {
    const prev = (previous.typeCounts?.[type] || 0) / 10;
    const curr = (current.typeCounts?.[type] || 0) / 10;
    const delta = curr - prev;

    if (Math.abs(delta) >= 0.3) {
      shifts.push({
        type:     "distribution_change",
        severity: Math.abs(delta) >= 0.5 ? "high" : "medium",
        pageType: type,
        description: `"${type}" pages: ${Math.round(prev * 10)} → ${Math.round(curr * 10)} in top 10 (${delta > 0 ? "+" : ""}${Math.round(delta * 100)}%)`,
        recommendation: delta > 0
          ? `Consider creating more ${type} content for this keyword`
          : `${type} content losing ground — check if your existing pages need updating`,
      });
    }
  }

  // New SERP features appeared
  const prevF = previous.features || {};
  const currF = current.features  || {};
  if (!prevF.hasShoppingAds && currF.hasShoppingAds) {
    shifts.push({ type: "new_feature", severity: "medium", description: "Shopping Ads appeared — commercial intent increased", recommendation: "Consider Google Shopping campaigns for this keyword" });
  }
  if (!prevF.hasFeaturedSnip && currF.hasFeaturedSnip) {
    shifts.push({ type: "new_feature", severity: "medium", description: "Featured Snippet appeared — optimize for direct answer format", recommendation: "Add a concise 40-60 word direct answer at the top of your page" });
  }

  return shifts.length > 0 ? shifts : null;
}

function getShiftRecommendation(from, to) {
  const map = {
    "informational→commercial": "Update your page to include pricing, CTAs, and product comparisons",
    "commercial→informational": "Add educational content, guides, and comparison sections to your page",
    "product→blog":             "Create a blog post targeting this keyword — product pages are losing ground",
    "blog→product":             "Optimize your product page for this keyword — informational content is losing ground",
    "product→category":         "Create a collection/category page targeting this keyword",
    "category→product":         "Individual product pages now rank — ensure top products target this keyword",
  };
  return map[`${from}→${to}`] || `Adjust your content to match the new "${to}" intent Google expects`;
}

// ─── Main run ─────────────────────────────────────────────────────────────────
export async function runIntentShiftDetection(storeId) {
  if (!getDfsAuth()) throw new Error("DataForSEO not configured");

  // Get keywords to monitor — from GSC triage (top keywords by impressions)
  const gscData = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "gsc_triage_results" } },
  });

  let keywords = [];
  if (gscData?.value) {
    try {
      const triage = JSON.parse(gscData.value);
      keywords = (triage.keywords || triage || [])
        .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
        .slice(0, 20)
        .map(k => k.keyword || k.query)
        .filter(Boolean);
    } catch {}
  }

  // Check for manually saved keywords (overrides GSC)
  const manualKwSetting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "intent_shift_keywords" } },
  });
  if (manualKwSetting?.value?.trim()) {
    keywords = manualKwSetting.value.split("\n").map(k => k.trim()).filter(Boolean).slice(0, 20);
    console.log(`[Intent] Using ${keywords.length} manually configured keywords`);
  }

  // Fallback: get from product titles if still empty
  if (keywords.length === 0) {
    const products = await prisma.product.findMany({
      where:   { storeId },
      select:  { title: true },
      take:    10,
      orderBy: { updatedAt: "desc" },
    });
    if (products.length > 0) {
      keywords = products
        .map(p => p.title?.toLowerCase().replace(/[^a-z0-9\sÀ-ɏ]/g, "").trim())
        .filter(Boolean)
        .slice(0, 10);
      console.log(`[Intent] Using ${keywords.length} product title keywords`);
    }
  }

  if (keywords.length === 0) throw new Error("No keywords to monitor — add keywords manually or connect GSC");

  console.log(`[Intent] Checking ${keywords.length} keywords`);

  // Load previous snapshot
  const prevSetting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "intent_shift_snapshot" } },
  });
  const previousSnapshot = prevSetting?.value ? JSON.parse(prevSetting.value) : {};

  // Check each keyword
  const currentSnapshot = {};
  const results = [];

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    try {
      const composition = await analyzeSerpComposition(keyword);
      currentSnapshot[keyword] = composition;

      const shifts = detectShift(previousSnapshot[keyword], composition);
      const hasShift = !!shifts?.length;

      results.push({
        keyword,
        current:  composition,
        previous: previousSnapshot[keyword] || null,
        shifts:   shifts || [],
        hasShift,
        isNew:    !previousSnapshot[keyword],
      });

      console.log(`[Intent] "${keyword}": ${composition.dominant}${hasShift ? " ⚠ SHIFT DETECTED" : ""}`);
      if (i < keywords.length - 1) await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.warn(`[Intent] Failed for "${keyword}":`, e.message);
    }
  }

  // Save new snapshot
  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: "intent_shift_snapshot" } },
    create: { storeId, key: "intent_shift_snapshot", value: JSON.stringify(currentSnapshot) },
    update: { value: JSON.stringify(currentSnapshot) },
  });

  const shiftsFound = results.filter(r => r.hasShift).length;

  const result = {
    keywords:    keywords.length,
    checked:     results.length,
    shiftsFound,
    isFirstRun:  Object.keys(previousSnapshot).length === 0,
    results:     results.sort((a, b) => (b.hasShift ? 1 : 0) - (a.hasShift ? 1 : 0)),
    checkedAt:   new Date().toISOString(),
  };

  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: "intent_shift_results" } },
    create: { storeId, key: "intent_shift_results", value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });

  console.log(`[Intent] Done — ${shiftsFound} shifts detected across ${results.length} keywords`);
  return result;
}

export async function getIntentShiftResults(storeId) {
  const s = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "intent_shift_results" } },
  });
  if (!s?.value) return null;
  try { return JSON.parse(s.value); } catch { return null; }
}

export async function getMonitoredKeywords(storeId) {
  const s = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "intent_shift_keywords" } },
  });
  return s?.value ? s.value.split("\n").filter(Boolean) : [];
}

export async function saveMonitoredKeywords(storeId, keywords) {
  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: "intent_shift_keywords" } },
    create: { storeId, key: "intent_shift_keywords", value: keywords },
    update: { value: keywords },
  });
}
