// app/lib/seo/fan-out.server.js
// Fan-out query coverage analyzer. Generates the sub-queries Google's AI
// Overviews + AI Mode emit when a user asks about a pillar topic, then
// audits which sub-queries the merchant's existing content covers.
//
// Why this matters (2026 research): AIO/top-10 overlap dropped from ~76%
// (July 2025) to 17-38% (February 2026). Ranking for a head keyword no
// longer guarantees citation — Google's fan-out retriever pulls from many
// sub-queries the user never typed. If your content doesn't cover the
// long tail of a topic, a competitor that does will be cited instead.
//
// Two phases:
//   1. generateFanOutQueries — Claude expands a pillar into 15-25 realistic
//      sub-queries grouped by intent.
//   2. analyzeCoverage — for each sub-query, search BlogArticle.content,
//      SeoProduct.productTitle, SeoCandidate.keyword for token overlap and
//      flag covered / partial / gap.

import prisma from "../../db.server.js";

const ANTHROPIC_API     = "https://api.anthropic.com/v1/messages";
const MODEL             = process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001";
const FETCH_TIMEOUT_MS  = 45_000;

function sanitizeKey(raw) { return (raw || "").replace(/[^\x21-\x7E]/g, ""); }

async function callAnthropicOnce({ apiKey, systemPrompt, userPrompt }) {
  const ac = new AbortController();
  const t  = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      signal: ac.signal,
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 2000,
        system:     systemPrompt,
        messages:   [{ role: "user", content: userPrompt }],
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      const err  = new Error(`Anthropic ${resp.status}: ${text.slice(0, 200)}`);
      err.transient = resp.status === 429 || resp.status >= 500;
      throw err;
    }
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

// ── PHASE 1: generate fan-out sub-queries ────────────────────────────────
export async function generateFanOutQueries({ primaryKeyword, language = "ro", count = 20 }) {
  const apiKey = sanitizeKey(process.env.ANTHROPIC_API_KEY);
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const systemPrompt = language === "en"
    ? `You expand a pillar keyword into the sub-queries Google's AI Overviews + AI Mode + Gemini Deep Search actually fan out into when a user asks about that topic. You simulate the real retrieval graph, not a keyword brainstorm.

Output exactly ${count} sub-queries covering:
- commercial intent (best / cheapest / under $X / for Y use-case): ~35%
- informational intent (how / what / why / when): ~30%
- comparison intent (X vs Y / X or Y): ~15%
- buying-decision intent (specifications / compatibility / sizing): ~10%
- problem-solving (X not working / how to fix Y): ~10%

Each sub-query must be a complete, realistic question a buyer types into ChatGPT, Claude, or Google AI Mode. No keyword stuffing. 4-12 words typical.

Output JSON only: [{"q": "...", "intent": "commercial|informational|comparison|buying-decision|problem-solving"}]. No markdown fences, no prose.`
    : `Expandezi un keyword pilon în sub-întrebările pe care Google AI Overviews + AI Mode + Gemini Deep Search le emit când un utilizator întreabă pe acel topic. Simulezi graful real de retrieval, nu un brainstorm de keywords.

Output exact ${count} sub-întrebări acoperind:
- intenție comercială (cel mai bun / cel mai ieftin / sub X lei / pentru utilizare Y): ~35%
- informațională (cum / ce / de ce / când): ~30%
- comparație (X vs Y / X sau Y): ~15%
- decizie de cumpărare (specificații / compatibilitate / dimensiuni): ~10%
- problemă (X nu funcționează / cum repar Y): ~10%

Fiecare sub-întrebare trebuie să fie completă, realistă, ca cea pe care un cumpărător român o tastează în ChatGPT/Claude/AI Mode. Fără keyword stuffing. Tipic 4-12 cuvinte.

Doar JSON: [{"q": "...", "intent": "commercial|informational|comparison|buying-decision|problem-solving"}]. Fără markdown, fără explicații.`;

  const userPrompt = `Pillar keyword: "${primaryKeyword}"\n\nGenerate the ${count} sub-queries.`;

  const message = await callAnthropicOnce({ apiKey, systemPrompt, userPrompt });
  const raw     = (message.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```\s*$/, "").trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); } catch { throw new Error("Claude returned unparseable JSON"); }
  if (!Array.isArray(parsed)) throw new Error("Expected JSON array");

  return parsed
    .filter(p => p?.q && typeof p.q === "string")
    .map(p => ({ q: p.q.trim(), intent: String(p.intent || "informational").toLowerCase() }));
}

// ── PHASE 2: coverage analysis (no AI, pure lexical match) ───────────────
function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")    // strip diacritics
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Stopwords for RO + EN — pulled inline so we don't add a dep. Skipping
// these prevents "how much does X cost" matching everything that says
// "how" or "much".
const STOPWORDS = new Set([
  "ce","cum","de","ce","cand","cand","cine","care","unde","cat","cati","cu","la","pe","si","in","din","pentru","fara","sub","peste","intre","sau","ori","mai","mult","multa","fi","fie","va","vor","nu",
  "the","a","an","and","or","of","in","on","at","by","for","with","from","is","are","do","does","how","what","why","when","who","which","where","can","to","so","but","than","that","this","these","those","be","been","being","i","you","he","she","it","we","they","my","your","our","their"
]);

function keyTokens(text, minLen = 3) {
  return normalize(text).split(" ").filter(t => t.length >= minLen && !STOPWORDS.has(t));
}

// Coverage = jaccard-ish overlap between query tokens and content tokens.
// Threshold tuned so a 5-token query matches when 3 tokens appear; below 0.5
// is a gap, ≥0.5 partial, ≥0.75 covered.
function overlapScore(queryTokens, contentTokens) {
  if (queryTokens.length === 0) return 0;
  const set = new Set(contentTokens);
  let hits  = 0;
  for (const t of queryTokens) if (set.has(t)) hits++;
  return hits / queryTokens.length;
}

export async function analyzeCoverage({ storeId, subQueries }) {
  if (!Array.isArray(subQueries) || subQueries.length === 0) return [];

  // Pull all candidate sources once — for catalogs up to a few thousand items
  // this is cheaper than per-query lookups. For very large catalogs (30k+),
  // we cap at the most-recent N to keep memory bounded.
  const [articles, products, keywords] = await Promise.all([
    prisma.blogArticle.findMany({
      where:  { storeId, status: { in: ["draft", "review", "published"] } },
      select: { id: true, titleTag: true, primaryKeyword: true, content: true, urlSlug: true },
      orderBy: { generatedAt: "desc" },
      take:   200,
    }),
    prisma.seoProduct.findMany({
      where:  { storeId },
      select: { id: true, productId: true, productTitle: true, aiTag: true, aiSub: true },
      orderBy: { updatedAt: "desc" },
      take:   1500,
    }),
    prisma.seoKeyword.findMany({
      where:  { storeId },
      select: { id: true, keyword: true, parentTag: true, collectionId: true },
      take:   2000,
    }),
  ]);

  // Pre-tokenize every source once.
  const articleTokens = articles.map(a => ({
    ref:    { type: "blog",    id: a.id, title: a.titleTag || a.primaryKeyword, url: a.urlSlug },
    tokens: keyTokens(`${a.titleTag || ""} ${a.primaryKeyword || ""} ${a.content || ""}`.slice(0, 12000)),
  }));
  const productTokens = products.map(p => ({
    ref:    { type: "product", id: p.productId, title: p.productTitle },
    tokens: keyTokens(`${p.productTitle || ""} ${p.aiTag || ""} ${p.aiSub || ""}`),
  }));
  const keywordTokens = keywords.map(k => ({
    ref:    { type: "keyword", id: k.id, title: k.keyword, collectionId: k.collectionId },
    tokens: keyTokens(`${k.keyword || ""} ${k.parentTag || ""}`),
  }));

  const results = [];
  for (const sq of subQueries) {
    const qTokens = keyTokens(sq.q);
    if (qTokens.length === 0) {
      results.push({ ...sq, covered: false, status: "gap" });
      continue;
    }

    // Best match across each source pool — track top score per pool.
    let best = { score: 0, coveringType: null, coveringId: null, coveringTitle: null };
    const considerPool = (pool) => {
      for (const item of pool) {
        const s = overlapScore(qTokens, item.tokens);
        if (s > best.score) {
          best = { score: s, coveringType: item.ref.type, coveringId: item.ref.id, coveringTitle: item.ref.title };
        }
      }
    };
    considerPool(articleTokens);
    considerPool(productTokens);
    considerPool(keywordTokens);

    let status;
    if (best.score >= 0.75)      status = "covered";
    else if (best.score >= 0.5)  status = "partial";
    else                          status = "gap";

    results.push({
      ...sq,
      covered: status !== "gap",
      status,
      score: Math.round(best.score * 100) / 100,
      coveringType:  best.coveringType,
      coveringId:    best.coveringId,
      coveringTitle: best.coveringTitle,
    });
  }
  return results;
}

// Orchestrator used by the route. Persists session at each phase so the UI
// can poll and the merchant doesn't lose the analysis on a refresh.
export async function runFanOut({ storeId, primaryKeyword, language = "ro", count = 20 }) {
  const session = await prisma.fanOutSession.create({
    data: { storeId, primaryKeyword, status: "running" },
  });
  try {
    const sub = await generateFanOutQueries({ primaryKeyword, language, count });
    const cov = await analyzeCoverage({ storeId, subQueries: sub });
    const covered = cov.filter(c => c.status === "covered").length;

    await prisma.fanOutSession.update({
      where: { id: session.id },
      data:  { status: "done", queries: JSON.stringify(cov), totalQueries: cov.length, coveredCount: covered },
    });
    return { id: session.id, queries: cov, totalQueries: cov.length, coveredCount: covered };
  } catch (e) {
    await prisma.fanOutSession.update({
      where: { id: session.id },
      data:  { status: "failed", errorMessage: e.message?.slice(0, 500) || "Unknown error" },
    }).catch(() => {});
    throw e;
  }
}
