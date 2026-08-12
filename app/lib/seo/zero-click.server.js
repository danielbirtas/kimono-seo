// app/lib/seo/zero-click.server.js
// Kimono SEO M13 — Zero-Click: optimize for featured snippets, PAA, definition boxes

import prisma from "../../db.server.js";

const CLAUDE_MODEL = "claude-sonnet-4-5";

function dfsAuth() {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return Buffer.from(`${login}:${password}`).toString("base64");
}

async function dfsFetch(endpoint, body) {
  const auth = dfsAuth();
  if (!auth) throw new Error("DataForSEO not configured");
  const resp = await fetch(`https://api.dataforseo.com${endpoint}`, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (data.status_code !== 20000) throw new Error(`DFS: ${data.status_message}`);
  return data;
}

async function callClaude(systemPrompt, userMsg, maxTokens = 1500) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: "user", content: userMsg }] }),
  });
  if (!resp.ok) throw new Error(`Claude ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.content?.[0]?.text || "";
}

function extractJson(text) {
  const m = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
  if (!m) throw new Error("No JSON in Claude response");
  return JSON.parse(m[1]);
}

// Fetch SERP for keyword and detect features (featured snippet, PAA, etc.)
async function fetchSerpFeatures(keyword, locationCode = 2642, languageCode = "ro") {
  const data = await dfsFetch("/v3/serp/google/organic/live/advanced", [{
    keyword, location_code: locationCode, language_code: languageCode,
    device: "desktop", depth: 10,
  }]);
  const items    = data.tasks?.[0]?.result?.[0]?.items || [];
  const features = [];

  for (const item of items) {
    if (item.type === "featured_snippet") {
      features.push({
        feature: "featured_snippet",
        url:     item.url || null,
        text:    (item.description || item.title || "").slice(0, 800),
        format:  item.featured_snippet_type || "paragraph",
      });
    }
    if (item.type === "people_also_ask" && item.items) {
      for (const paa of item.items.slice(0, 4)) {
        if (paa.title) {
          features.push({
            feature: "people_also_ask",
            url:     paa.expanded_element?.[0]?.url || null,
            text:    `Q: ${paa.title}\nA: ${paa.expanded_element?.[0]?.description || "(nu există răspuns în SERP)"}`.slice(0, 800),
            format:  "qa",
          });
        }
      }
    }
    if (item.type === "answer_box") {
      features.push({
        feature: "definition",
        url:     item.url || null,
        text:    (item.description || "").slice(0, 800),
        format:  "definition",
      });
    }
    if (item.type === "video") {
      features.push({
        feature: "video_pack",
        url:     item.url || null,
        text:    item.title || "",
        format:  "video",
      });
    }
  }

  return features;
}

export async function scanKeywordsForZeroClick(storeId, limit = 10) {
  // Take top keywords from SeoKeyword table
  const keywords = await prisma.seoKeyword.findMany({
    where:   { storeId },
    orderBy: [{ volume: "desc" }],
    take:    limit,
    select:  { keyword: true },
  });

  if (keywords.length === 0) throw new Error("Nu există keywords în bază. Rulează întâi Keywords (Pas 2).");

  let totalFeatures = 0;

  for (const kw of keywords) {
    let features = [];
    try { features = await fetchSerpFeatures(kw.keyword); }
    catch (e) { console.warn(`[ZeroClick] SERP fetch failed for "${kw.keyword}":`, e.message); continue; }

    for (const f of features) {
      // Check if already exists (skip duplicates)
      const existing = await prisma.seoZeroClickOpt.findFirst({
        where: { storeId, keyword: kw.keyword, serpFeature: f.feature },
      });
      if (existing) continue;

      await prisma.seoZeroClickOpt.create({
        data: {
          storeId,
          keyword:        kw.keyword,
          serpFeature:    f.feature,
          competitorUrl:  f.url,
          competitorText: f.text,
          recommendedFormat: f.format,
          status: "pending",
        },
      });
      totalFeatures++;
    }
  }

  return { keywords: keywords.length, features: totalFeatures };
}

export async function generateRecommendation(storeId, optId) {
  const opt = await prisma.seoZeroClickOpt.findUnique({ where: { id: optId } });
  if (!opt || opt.storeId !== storeId) throw new Error("Nu există opt");

  const system = `Ești expert SEO pentru featured snippets și AI Overviews. Scrii texte scurte, DENSE, FACTUALE, optimizate pentru a fi citate ca răspuns direct.`;

  const userMsg = `Keyword: "${opt.keyword}"
SERP Feature: ${opt.serpFeature}
Format recomandat: ${opt.recommendedFormat}
Răspunsul competitor actual din SERP:
---
${opt.competitorText}
---

Scrie o versiune MAI BUNĂ, în română, care să:
- Răspundă DIRECT la întrebare în primele 40-60 cuvinte
- Folosească date numerice concrete dacă sunt relevante
- Fie auto-conținut (fără "mai multe detalii mai jos")
- Urmeze format-ul recomandat (${opt.recommendedFormat})
- Să aibă 50-150 cuvinte total

Returnează JSON:
\`\`\`json
{
  "recommendedText": "textul propus (50-150 cuvinte)",
  "format": "paragraph|list|table|qa",
  "rationale": "de ce e mai bun (1 frază)"
}
\`\`\``;

  const raw    = await callClaude(system, userMsg, 1200);
  const result = extractJson(raw);

  return prisma.seoZeroClickOpt.update({
    where: { id: optId },
    data:  {
      recommendedText:   result.recommendedText,
      recommendedFormat: result.format || opt.recommendedFormat,
      status:            "approved",
    },
  });
}

export async function markApplied(storeId, optId, applicableUrl) {
  return prisma.seoZeroClickOpt.update({
    where: { id: optId },
    data:  { status: "applied", applicableUrl, appliedAt: new Date() },
  });
}

export async function dismissOpt(storeId, optId) {
  return prisma.seoZeroClickOpt.update({
    where: { id: optId },
    data:  { status: "rejected" },
  });
}
