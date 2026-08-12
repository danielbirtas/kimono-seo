// app/routes/api.seo.keywords.js
// Kimono SEO — SEO Keyword Research API
// DataForSEO cu fallback Anthropic (nu mai folosim OpenAI)

import { hasDfsConfig, fetchKeywordIdeas, filterKeywordsByBuckets } from "../lib/seo/dataforseo.server.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const LANG_MAP = {
  ro: { name: "Romanian", country: "Romania",         examples: "cumparatori romani pe Google Romania" },
  en: { name: "English",  country: "international",   examples: "English-speaking shoppers on Google"  },
  de: { name: "German",   country: "Germany/Austria", examples: "deutschsprachige Käufer auf Google"   },
  fr: { name: "French",   country: "France",          examples: "acheteurs francophones sur Google"    },
  hu: { name: "Hungarian", country: "Hungary",        examples: "magyar vásárlók a Google-on"          },
};

async function generateKeywordsWithAnthropic(apiKey, model, tag, kwPerBucket, language) {
  const keyword       = tag.replace(/-/g, " ");
  const totalKeywords = kwPerBucket * 3;
  const lang          = LANG_MAP[language] || LANG_MAP.ro;

  const resp = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key":         apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type":      "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system: `Expert SEO keyword researcher for ${lang.country} e-commerce. Respond ONLY with valid JSON arrays, no markdown.`,
      messages: [{
        role: "user",
        content: `Generate keyword research for: "${keyword}"
Generate exactly ${totalKeywords} keywords that ${lang.examples} would search for.
All keywords in ${lang.name} language.
Include variations: singular/plural, with/without attributes, long-tail.
Estimate monthly search volume (realistic for ${lang.country} market).
Classify competition: HIGH / MEDIUM / LOW
Include type: "transactional" / "informational" / "comparative"

Return ONLY a valid JSON array:
[{"keyword":"keyword text","volume":500,"competition":"HIGH","cpcLow":0.15,"cpcHigh":0.45,"type":"transactional"}]

Distribute: ${kwPerBucket} HIGH + ${kwPerBucket} MEDIUM + ${kwPerBucket} LOW. ONLY valid JSON array.`,
      }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Anthropic ${resp.status}: ${err}`);
  }

  const data    = await resp.json();
  const content = data.content?.[0]?.text?.trim() || "";
  const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const match   = cleaned.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Invalid JSON from Anthropic keywords");

  const keywords = JSON.parse(match[0]);
  if (!Array.isArray(keywords)) throw new Error("Anthropic response is not an array");
  return keywords;
}

export const loader = async ({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ keywords: [] });

  const url = new URL(request.url);
  const intent = url.searchParams.get("intent");
  const limit = parseInt(url.searchParams.get("limit") || "5");

  if (intent === "top_keywords") {
    const gscData = await prisma.seoSetting.findUnique({
      where: { storeId_key: { storeId, key: "gsc_triage_results" } },
    });
    if (gscData?.value) {
      try {
        const triage = JSON.parse(gscData.value);
        const keywords = (triage.keywords || triage || [])
          .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
          .slice(0, limit)
          .map(k => ({ keyword: k.keyword || k.query || "" }))
          .filter(k => k.keyword);
        return Response.json({ keywords });
      } catch {}
    }
  }

  if (intent === "top_product_keywords") {
    try {
      const products = await prisma.product.findMany({
        where: { storeId }, select: { title: true }, take: 50, orderBy: { updatedAt: "desc" },
      });
      let titles = products.map(p => p.title).filter(Boolean);

      if (titles.length === 0 && connection?.shopDomain && connection?.accessToken) {
        const shopResp = await fetch(
          `https://${connection.shopDomain}/admin/api/2025-04/products.json?limit=50&fields=title`,
          { headers: { "X-Shopify-Access-Token": connection.accessToken } }
        );
        if (shopResp.ok) {
          const shopData = await shopResp.json();
          titles = (shopData.products || []).map(p => p.title).filter(Boolean);
        }
      }

      const stopWords = new Set(["si","sau","cu","de","la","in","pe","un","o","cel","cea","cei","cele","este","sunt","pentru","din","care","ce","ca","se","nu","mai","fi","va","au","fost","ii","the","and","for","with","from"]);
      const kwMap = {};
      for (const title of titles) {
        const clean = title.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
        if (clean.length > 3) kwMap[clean] = (kwMap[clean] || 0) + 3;
        clean.split(" ").filter(w => w.length > 3 && !stopWords.has(w)).forEach(w => {
          kwMap[w] = (kwMap[w] || 0) + 1;
        });
      }
      const sorted = Object.entries(kwMap).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([kw]) => kw);
      return Response.json({ keywords: sorted, source: titles.length > 0 ? "shopify" : "empty" });
    } catch (e) {
      return Response.json({ keywords: [], error: e.message });
    }
  }

  if (intent === "fallback_keywords") {
    try {
      const candidates = await prisma.seoCandidate.findMany({
        where: { storeId }, orderBy: { impressions: "desc" }, take: limit, select: { keyword: true },
      });
      return Response.json({ keywords: candidates.map(c => ({ keyword: c.keyword })) });
    } catch {
      return Response.json({ keywords: [] });
    }
  }

  return Response.json({ keywords: [] });
};

export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });
  const body        = await request.json().catch(() => ({}));
  const { isFirst, tag } = body;

  try {
    const storeSettings = await prisma.storeSettings.findUnique({ where: { storeId } });
    const model         = storeSettings?.aiModel    || process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001";
    const language      = storeSettings?.aiLanguage || "ro";

    if (isFirst || !tag) {
      await prisma.seoKeyword.deleteMany({ where: { storeId } });
      const tagRows = await prisma.seoProduct.findMany({
        where: { storeId, aiTag: { not: null }, NOT: { aiTag: "" } },
        distinct: ["aiTag"], select: { aiTag: true }, orderBy: { aiTag: "asc" },
      });
      return Response.json({
        success: true,
        data: { tags: tagRows.map((r) => r.aiTag).filter(Boolean), source: hasDfsConfig() ? "dataforseo" : "anthropic" },
      });
    }

    const perBucket = 10;
    let keywords    = [];
    let source      = "anthropic";

    if (hasDfsConfig()) {
      try {
        const limit        = perBucket * 3 + 10;
        const raw          = await fetchKeywordIdeas(tag, language, limit);
        const { selected } = filterKeywordsByBuckets(raw, perBucket);
        keywords = selected;
        source   = "dataforseo";
      } catch (dfsError) {
        console.warn(`[SEO Keywords] DataForSEO failed for "${tag}", falling back to Anthropic:`, dfsError.message);
      }
    }

    if (keywords.length === 0) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return Response.json({ success: false, error: "No keyword source available. Configure DataForSEO or Anthropic API key." }, { status: 400 });
      }
      keywords = await generateKeywordsWithAnthropic(apiKey, model, tag, perBucket, language);
    }

    const seen   = new Set();
    const unique = [];
    for (const kw of keywords.filter((k) => k.keyword)) {
      const key = kw.keyword.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push({
          keyword:     kw.keyword.trim(),
          volume:      Math.max(0, parseInt(kw.volume) || 0),
          competition: ["HIGH", "MEDIUM", "LOW"].includes(kw.competition?.toUpperCase()) ? kw.competition.toUpperCase() : "MEDIUM",
          cpcLow:      Math.max(0, parseFloat(kw.cpcLow)  || 0),
          cpcHigh:     Math.max(0, parseFloat(kw.cpcHigh) || 0),
          type:        ["transactional", "informational", "comparative"].includes(kw.type) ? kw.type : "transactional",
        });
      }
    }

    if (unique.length > 0) {
      await prisma.$transaction(
        unique.map((kw) => prisma.seoKeyword.create({
          data: { storeId, parentTag: tag, keyword: kw.keyword, volume: kw.volume, competition: kw.competition, cpcLow: kw.cpcLow, cpcHigh: kw.cpcHigh, kwType: kw.type },
        }))
      );
    }

    const counts = { high: 0, medium: 0, low: 0 };
    for (const kw of unique) counts[(kw.competition || "LOW").toLowerCase()]++;

    return Response.json({
      success: true,
      data: { tag, source, keywordsSaved: unique.length, high: counts.high, medium: counts.medium, low: counts.low, sample: unique.slice(0, 6).map((k) => ({ keyword: k.keyword, volume: k.volume, competition: k.competition })) },
    });
  } catch (error) {
    console.error("[SEO Keywords]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
};
