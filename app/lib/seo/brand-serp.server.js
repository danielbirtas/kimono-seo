// app/lib/seo/brand-serp.server.js
// Kimono SEO #24 — Brand SERP Monitor
// Checks what appears in Google for brand name searches via DataForSEO

import prisma from "../../db.server.js";

function getDfsAuth() {
  const login    = process.env.DATAFORSEO_LOGIN    || "";
  const password = process.env.DATAFORSEO_PASSWORD || "";
  if (!login || !password) return null;
  return Buffer.from(`${login}:${password}`).toString("base64");
}

async function dfsFetch(endpoint, body) {
  const auth = getDfsAuth();
  if (!auth) throw new Error("DataForSEO not configured");
  const resp = await fetch(`https://api.dataforseo.com${endpoint}`, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (data.status_code !== 20000) throw new Error(`DataForSEO error: ${data.status_message}`);
  return data;
}

export async function scanBrandSerp(storeId, shopDomain) {
  // Load declared social URLs
  const socialUrlsSetting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "brand_social_urls" } },
  });
  const declaredSocialDomains = (socialUrlsSetting?.value || "")
    .split("\n")
    .map(u => { try { return new URL(u.trim()).hostname.replace("www.", ""); } catch { return ""; } })
    .filter(Boolean);
  const brandSetting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "brand_name" } },
  });
  const brandName = brandSetting?.value || shopDomain.replace(".myshopify.com", "").replace(/-/g, " ");

  console.log(`[Brand SERP] Scanning for "${brandName}"`);

  const data = await dfsFetch("/v3/serp/google/organic/live/advanced", [{
    keyword:       brandName,
    location_code: 2040,
    language_code: "ro",
    device:        "desktop",
    depth:         10,
    se_domain:     "google.ro",
  }]);

  const taskResult = data.tasks?.[0]?.result?.[0];
  const items      = taskResult?.items || [];
  const serpTypes  = [...new Set(items.map(i => i.type))];
  console.log(`[Brand SERP] Task status: ${data.tasks?.[0]?.status_message}, items: ${items.length}, types: [${serpTypes.join(",")}]`);

  const result = {
    brandName,
    serpTypes,
    knowledgePanel:  null,
    sitelinks:       [],
    organicResults:  [],
    competitors:     [],
    reviews:         null,
    featuredSnippet: null,
    anomalies:       [],
    scannedAt:       new Date().toISOString(),
  };

  const gscSiteSetting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "seo_gsc_site_url" } },
  });
  const ownDomain = gscSiteSetting?.value
    ? gscSiteSetting.value.replace(/https?:\/\//, "").replace(/\/$/, "")
    : shopDomain.replace(".myshopify.com", "") + ".ro";

  for (const item of items) {
    // Knowledge Panel
    if (item.type === "knowledge_graph") {
      result.knowledgePanel = {
        title:       item.title || "",
        description: item.description || "",
        logo:        item.logo?.url || null,
        rating:      item.rating?.value || null,
        reviewCount: item.rating?.votes_count || null,
        website:     item.url || "",
      };
    }

    // Featured snippet
    if (item.type === "featured_snippet") {
      result.featuredSnippet = {
        title: item.title || "",
        url:   item.url   || "",
        text:  item.description || "",
      };
    }

    // Organic results — separate own vs competitors
    if (item.type === "organic") {
      const url       = item.url || "";
      const brandSlug = brandName.toLowerCase().replace(/\s/g, "");
      const isSocial  = /facebook\.com|instagram\.com|linkedin\.com|twitter\.com|tiktok\.com|youtube\.com/.test(url);
      const position  = item.rank_absolute || item.rank_group || 0;

      // Own domain: must contain the actual domain string
      const isOwnDomain = ownDomain && url.includes(ownDomain);
      // Own social: declared social URLs OR (social platform AND brand in title/URL)
      const urlHostname = (() => { try { return new URL(url).hostname.replace("www.", ""); } catch { return ""; } })();
      const isDeclaredSocial = declaredSocialDomains.some(d => urlHostname === d || url.includes(d));
      const titleLower = (item.title || "").toLowerCase();
      const brandWords = brandName.toLowerCase().split(/\s+/);
      const titleHasBrand = brandWords.every(w => titleLower.includes(w));
      const isOwnSocial = isDeclaredSocial || (isSocial && (url.toLowerCase().includes(brandSlug) || titleHasBrand));

      const organic = {
        position,
        title:       item.title || "",
        url,
        description: item.description || "",
        sitelinks:   item.sitelinks?.map(s => ({ title: s.title, url: s.url })) || [],
        type: isOwnDomain ? "own" : isOwnSocial ? "social" : "competitor",
      };

      // Track all top 10 for display
      if (position >= 1 && position <= 10) {
        if (!result.allResults) result.allResults = [];
        result.allResults.push(organic);
      }

      if (isOwnDomain) {
        result.organicResults.push(organic);
        if (organic.sitelinks.length > 0) result.sitelinks = organic.sitelinks;
      } else if (isOwnSocial) {
        if (!result.socialProfiles) result.socialProfiles = [];
        result.socialProfiles.push(organic);
      } else if (position <= 10) {
        result.competitors.push(organic);
      }
    }

    // Reviews
    if (item.type === "reviews") {
      result.reviews = {
        rating:      item.rating?.value || null,
        reviewCount: item.rating?.votes_count || null,
        source:      item.source || "",
      };
    }
  }

  // Detect anomalies
  if (result.organicResults.length === 0) {
    result.anomalies.push({ severity: "high", message: `Your site doesn't appear in top 20 for "${brandName}" — possible indexing issue` });
  }
  if (result.organicResults[0]?.position > 3) {
    result.anomalies.push({ severity: "medium", message: `Your site ranks #${result.organicResults[0].position} for your own brand — competitors may be outranking you` });
  }
  if (result.competitors.length > 2) {
    result.anomalies.push({ severity: "medium", message: `${result.competitors.length} competitors appear in top 10 for your brand name` });
  }
  if (!result.knowledgePanel) {
    result.anomalies.push({ severity: "low", message: "No Knowledge Panel found — add Organization schema + Google Business Profile to establish brand entity" });
  }

  // Save to DB
  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: "brand_serp_results" } },
    create: { storeId, key: "brand_serp_results", value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });

  console.log(`[Brand SERP] Done — ${result.organicResults.length} own results, ${result.competitors.length} competitors, ${result.anomalies.length} anomalies`);
  return result;
}

export async function getBrandSerpResults(storeId) {
  const setting = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "brand_serp_results" } },
  });
  if (!setting?.value) return null;
  try { return JSON.parse(setting.value); } catch { return null; }
}
