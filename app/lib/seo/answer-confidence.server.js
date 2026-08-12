// app/lib/seo/answer-confidence.server.js
// Kimono SEO M27 — Answer Confidence: AI citability score 0-100 per content piece

import prisma from "../../db.server.js";
import crypto from "node:crypto";

const CLAUDE_MODEL = "claude-sonnet-4-5";

function sha1(s) { return crypto.createHash("sha1").update(s).digest("hex"); }

async function callClaude(systemPrompt, userMsg, maxTokens = 2500) {
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

// Strip HTML to text (basic — good enough for scoring)
function htmlToText(html) {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// 8 criteria — aligned with AI citation research (Perplexity, ChatGPT, Claude all prefer these)
const CRITERIA = [
  { key: "direct_answer",     weight: 18, desc: "Răspuns direct în primele 40-60 cuvinte ale fiecărei secțiuni" },
  { key: "numerical_facts",   weight: 14, desc: "Date numerice, procente, ani, cifre concrete" },
  { key: "passage_independence", weight: 14, desc: "Fiecare H2/paragraf se înțelege independent" },
  { key: "source_authority",  weight: 12, desc: "Citări către surse (studii, statistici, autor identificat)" },
  { key: "format_clarity",    weight: 10, desc: "Liste, tabele, subliniere pentru scanabilitate" },
  { key: "entity_mentions",   weight: 10, desc: "Nume proprii (brand, produse, persoane) menționate explicit" },
  { key: "freshness_signals", weight: 10, desc: "Dată recentă, 'updated', referințe la evenimente curente" },
  { key: "no_fluff",          weight: 12, desc: "Fără introducere goală, fără CTA-uri între paragrafe, fără 'în acest articol vom vedea...'" },
];

export async function scoreContent(storeId, opts) {
  const { sourceType, sourceId = null, sourceTitle, sourceUrl = null, contentHtml } = opts;
  const text = htmlToText(contentHtml);
  if (!text || text.length < 200) throw new Error("Conținutul e prea scurt pentru evaluare (<200 caractere).");

  const hash = sha1(text);

  // Dedupe: return existing if same content already scored
  const existing = await prisma.seoAnswerConfidence.findUnique({
    where: { storeId_sourceType_sourceId_contentHash: { storeId, sourceType, sourceId, contentHash: hash } },
  });
  if (existing) return existing;

  const criteriaList = CRITERIA.map((c, i) => `${i + 1}. **${c.key}** (${c.weight}%): ${c.desc}`).join("\n");

  const system = `Ești auditor SEO pentru AI citability (cât de probabil e ca Perplexity, ChatGPT, Claude, Gemini să citeze acest conținut ca răspuns direct). Evaluezi strict, numeric, și returnezi JSON.`;

  // Truncate content if too long (max ~12k chars for budget)
  const truncatedText = text.length > 12000 ? text.slice(0, 12000) + "...[trunchiat]" : text;

  const userMsg = `Titlu: "${sourceTitle}"
${sourceUrl ? `URL: ${sourceUrl}` : ""}

Conținut de analizat (HTML strip-uit la text):
---
${truncatedText}
---

CRITERII (8, ponderate):
${criteriaList}

Pentru fiecare criteriu:
- Scor: 0-100
- Feedback: 1-2 fraze concrete (ce e bine, ce lipsește)

Apoi calculează overallScore = Σ(score_i * weight_i/100).

Returnează JSON:
\`\`\`json
{
  "overallScore": <int 0-100>,
  "criteria": [
    { "name": "direct_answer",     "score": <int>, "feedback": "..." },
    { "name": "numerical_facts",   "score": <int>, "feedback": "..." },
    { "name": "passage_independence", "score": <int>, "feedback": "..." },
    { "name": "source_authority",  "score": <int>, "feedback": "..." },
    { "name": "format_clarity",    "score": <int>, "feedback": "..." },
    { "name": "entity_mentions",   "score": <int>, "feedback": "..." },
    { "name": "freshness_signals", "score": <int>, "feedback": "..." },
    { "name": "no_fluff",          "score": <int>, "feedback": "..." }
  ],
  "recommendations": [
    { "section": "H2 sau zonă specifică", "issue": "problema identificată", "fix": "acțiune concretă" }
  ]
}
\`\`\`
Max 5 recomandări, cele cu impact cel mai mare.`;

  const raw    = await callClaude(system, userMsg, 2500);
  const result = extractJson(raw);

  return prisma.seoAnswerConfidence.upsert({
    where: { storeId_sourceType_sourceId_contentHash: { storeId, sourceType, sourceId, contentHash: hash } },
    create: {
      storeId, sourceType, sourceId, sourceTitle, sourceUrl, contentHash: hash,
      overallScore: result.overallScore ?? 0,
      criteria: result.criteria || [],
      recommendations: result.recommendations || [],
    },
    update: {
      overallScore: result.overallScore ?? 0,
      criteria: result.criteria || [],
      recommendations: result.recommendations || [],
      runAt: new Date(),
    },
  });
}

// Convenience: score a BlogArticle by id
export async function scoreBlogArticle(storeId, articleId) {
  const article = await prisma.blogArticle.findUnique({ where: { id: articleId } });
  if (!article || article.storeId !== storeId) throw new Error("Article not found");

  return scoreContent(storeId, {
    sourceType:  "blog_article",
    sourceId:    article.id,
    sourceTitle: article.h1 || article.titleTag || article.primaryKeyword || "(fără titlu)",
    sourceUrl:   null,
    contentHtml: article.content || "",
  });
}

// Score latest N blog articles that don't have a recent score
export async function scoreRecentArticles(storeId, limit = 10) {
  const articles = await prisma.blogArticle.findMany({
    where:   { storeId },
    orderBy: { updatedAt: "desc" },
    take:    limit,
  });
  const results = { ok: 0, failed: 0 };
  for (const a of articles) {
    try { await scoreBlogArticle(storeId, a.id); results.ok++; }
    catch (e) { console.warn("[AnswerConfidence]", a.id, e.message); results.failed++; }
    await new Promise(r => setTimeout(r, 400));
  }
  return results;
}
