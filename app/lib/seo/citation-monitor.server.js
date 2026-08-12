// app/lib/seo/citation-monitor.server.js
// Kimono SEO #28 — Citation & Mention Monitoring
// Monitors where brand is mentioned online via DataForSEO Content Analysis API
// Identifies competitor citations and editorial placement opportunities

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

// ─── Fetch mentions via DataForSEO Content Analysis ───────────────────────────
async function fetchMentions(keyword, limit = 50) {
  try {
    const data = await dfsFetch("/v3/content_analysis/search/live", [{
      keyword,
      limit,
      order_by: ["rating,desc"],
      filters:  [
        ["content_info.connotation_types.positive", ">", 0],
        "or",
        ["content_info.connotation_types.negative", ">", 0],
      ],
    }]);

    const task   = data.tasks?.[0];
    const result = task?.result?.[0];

    console.log(`[Citation] "${keyword}": task=${task?.status_code} total=${result?.total_count}`);

    if (task?.status_code !== 20000 || !result?.items?.length) {
      console.log(`[Citation] Content Analysis not available or no results`);
      return { items: [], total: 0, available: task?.status_code === 20000 };
    }

    return {
      items:     result.items,
      total:     result.total_count || 0,
      available: true,
    };
  } catch (e) {
    console.warn(`[Citation] fetchMentions failed: ${e.message}`);
    return { items: [], total: 0, available: false, error: e.message };
  }
}

// ─── Classify mention sentiment and type ─────────────────────────────────────
function classifyMention(item) {
  const url     = item.url || "";
  const title   = item.title || "";
  const snippet = item.snippet || item.highlighted_text || "";
  const rating  = item.rating || 0;

  // Sentiment from DataForSEO
  const connotation = item.content_info?.connotation_types || {};
  const sentiment = connotation.positive > connotation.negative ? "positive"
    : connotation.negative > connotation.positive ? "negative"
    : "neutral";

  // Domain authority / type
  const domain = (() => { try { return new URL(url).hostname.replace("www.", ""); } catch { return ""; } })();

  const isNews      = /news|stiri|ziar|revista|media/i.test(domain) || rating > 80;
  const isBlog      = /blog|wordpress|blogspot/i.test(domain);
  const isSocial    = /facebook|instagram|twitter|tiktok|linkedin|youtube/i.test(domain);
  const isReview    = /review|recenzii|pareri|opinii|forum/i.test(domain) || /recenzie|parere|review/i.test(title);
  const isDirectory = /catalog|director|pagini-aurii|listafirme/i.test(domain);

  const type = isNews ? "news" : isSocial ? "social" : isReview ? "review" : isBlog ? "blog" : isDirectory ? "directory" : "web";

  return {
    url,
    domain,
    title,
    snippet: snippet.slice(0, 200),
    sentiment,
    type,
    rating:  Math.round(rating),
    isNews,
    isBlog,
    isSocial,
  };
}

// ─── AI Gap Analysis ──────────────────────────────────────────────────────────
async function getAiOpportunities(brandName, ownMentions, competitorMentions) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001";

  const ownDomains  = [...new Set(ownMentions.map(m => m.domain))].slice(0, 10).join(", ");
  const compDomains = [...new Set(competitorMentions.flatMap(c => c.mentions.map(m => m.domain)))].slice(0, 15).join(", ");

  const prompt = `You are an SEO and PR expert for Romanian e-commerce. Analyze brand mention data and provide placement opportunities.

Brand: ${brandName}
Where brand is mentioned: ${ownDomains || "No mentions found yet"}
Where competitors appear: ${compDomains || "No competitor data"}
Own mention count: ${ownMentions.length}
Competitor mention total: ${competitorMentions.reduce((s, c) => s + c.mentions.length, 0)}

Respond with ONLY valid JSON, plain ASCII, no special characters:
{"gaps":["Site or publication type where competitors appear but brand does not"],"opportunities":["Specific actionable outreach opportunity 1","Opportunity 2","Opportunity 3"],"priorityAction":"Single most important action to take this week","estimatedImpact":"Expected GEO improvement from implementing recommendations"}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body:    JSON.stringify({ model, max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
    });
    const d = await resp.json();
    const text = (d.content?.[0]?.text || "").replace(/[^\x20-\x7E]/g, " ");
    const start = text.indexOf("{");
    const end   = text.lastIndexOf("}");
    if (start === -1) return null;
    return JSON.parse(text.slice(start, end + 1));
  } catch { return null; }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export async function runCitationMonitor(storeId) {
  if (!getDfsAuth()) throw new Error("DataForSEO not configured");

  const [brandSetting, compSetting] = await Promise.all([
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "brand_name" } } }),
    prisma.seoSetting.findUnique({ where: { storeId_key: { storeId, key: "citation_competitors" } } }),
  ]);

  const brandName  = brandSetting?.value || "";
  const competitors = (compSetting?.value || "")
    .split("\n").map(c => c.trim()).filter(Boolean).slice(0, 3);

  if (!brandName) throw new Error("Brand name not configured — set it in Brand SERP settings");

  console.log(`[Citation] Monitoring: "${brandName}" vs [${competitors.join(", ")}]`);

  // Fetch own brand mentions
  const ownResult = await fetchMentions(brandName, 50);
  const ownMentions = ownResult.items.map(classifyMention);

  // Fetch competitor mentions
  const competitorData = [];
  for (const comp of competitors) {
    await new Promise(r => setTimeout(r, 500));
    const compResult = await fetchMentions(comp, 30);
    competitorData.push({
      brand:    comp,
      mentions: compResult.items.map(classifyMention),
      total:    compResult.total,
    });
  }

  // Sentiment breakdown
  const sentimentBreakdown = {
    positive: ownMentions.filter(m => m.sentiment === "positive").length,
    neutral:  ownMentions.filter(m => m.sentiment === "neutral").length,
    negative: ownMentions.filter(m => m.sentiment === "negative").length,
  };

  // Type breakdown
  const typeBreakdown = {};
  for (const m of ownMentions) {
    typeBreakdown[m.type] = (typeBreakdown[m.type] || 0) + 1;
  }

  // Find domains where competitors appear but brand doesn't
  const ownDomainSet = new Set(ownMentions.map(m => m.domain));
  const gapDomains = [];
  for (const comp of competitorData) {
    for (const mention of comp.mentions) {
      if (!ownDomainSet.has(mention.domain) && mention.domain) {
        gapDomains.push({
          domain:     mention.domain,
          competitor: comp.brand,
          type:       mention.type,
          rating:     mention.rating,
          url:        mention.url,
          title:      mention.title,
        });
      }
    }
  }

  // Deduplicate gaps, keep highest rated per domain
  const gapMap = {};
  for (const gap of gapDomains) {
    if (!gapMap[gap.domain] || gap.rating > gapMap[gap.domain].rating) {
      gapMap[gap.domain] = gap;
    }
  }
  const topGaps = Object.values(gapMap)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 20);

  // AI opportunities
  const aiOpportunities = await getAiOpportunities(brandName, ownMentions, competitorData);

  const result = {
    brandName,
    competitors,
    dfsAvailable: ownResult.available,
    ownMentions:  {
      total:     ownResult.total,
      fetched:   ownMentions.length,
      sentiment: sentimentBreakdown,
      byType:    typeBreakdown,
      topMentions: ownMentions
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 20),
    },
    competitorMentions: competitorData.map(c => ({
      brand:   c.brand,
      total:   c.total,
      fetched: c.mentions.length,
      topMentions: c.mentions.sort((a, b) => b.rating - a.rating).slice(0, 5),
    })),
    gaps:              topGaps,
    aiOpportunities,
    monitoredAt:       new Date().toISOString(),
  };

  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: "citation_results" } },
    create: { storeId, key: "citation_results", value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });

  console.log(`[Citation] Done — ${ownMentions.length} own, ${topGaps.length} gap opportunities`);
  return result;
}

export async function getCitationResults(storeId) {
  const s = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "citation_results" } },
  });
  if (!s?.value) return null;
  try { return JSON.parse(s.value); } catch { return null; }
}
