// app/lib/seo/keyword-discovery.server.js
//
// Five-source keyword candidate discovery for SEO Brain. Replaces the
// single-AI-call Extract step which produced only 4 candidates per product
// on average (and missed obvious commercial combinations like
// "tapet autoadeziv bucatarie" with vol 880 because Vivimall's stuffed
// titles drowned the AI signal).
//
// Sources:
//  1. AI Extract v2 (Claude Sonnet) — uses normalized title, commercial-only prompt
//  2. Pattern combinatorial — rule-based 2-grams/3-grams from clean tokens
//  3. Synonym expansion — synonyms-ro.json applied to existing candidates
//  4. GSC Mining — real query data from SeoGscData
//  5. Cross-product borrowing — top keywords from sibling products
//
// Output: 30-60 deduped candidate strings per product, ready for DFS enrich.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import prisma from "../../db.server.js";
import { getNormalizedTitle } from "./title-normalizer.server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ────────────────────────────────────────────────────────────────────────────
// Dictionaries — loaded once at module init
// ────────────────────────────────────────────────────────────────────────────
const SYNONYMS  = loadJson("synonyms-ro.json");
const STOPWORDS = loadJson("stop-words-ro.json");

function loadJson(file) {
  try {
    return JSON.parse(readFileSync(join(__dirname, file), "utf8"));
  } catch {
    return {};
  }
}

// Flatten synonyms into Map<canonicalToken, Set<synonyms>>
const SYNONYM_MAP = (() => {
  const m = new Map();
  for (const cat of Object.values(SYNONYMS._categories || {})) {
    for (const [canon, syns] of Object.entries(cat)) {
      const set = m.get(canon) || new Set();
      for (const s of syns) set.add(s.toLowerCase());
      m.set(canon.toLowerCase(), set);
      // Bidirectional: each synonym maps back to the canonical + siblings
      for (const s of syns) {
        const reverseSet = m.get(s.toLowerCase()) || new Set();
        reverseSet.add(canon.toLowerCase());
        for (const sib of syns) if (sib !== s) reverseSet.add(sib.toLowerCase());
        m.set(s.toLowerCase(), reverseSet);
      }
    }
  }
  return m;
})();

const STOP_SET = new Set([
  ...(STOPWORDS.stop_words_generic || []),
  ...(STOPWORDS.ecommerce_noise   || []),
].map(s => s.toLowerCase()));

const MIN_TOKEN_LEN = STOPWORDS.min_token_length || 3;
const MAX_TOKEN_LEN = STOPWORDS.max_token_length || 30;

// ────────────────────────────────────────────────────────────────────────────
// Normalization helpers
// ────────────────────────────────────────────────────────────────────────────
export function normalizeKeyword(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s) {
  return normalizeKeyword(s).split(/\s+/).filter(Boolean);
}

// Significant token = not a stop-word, not pure number, length in range,
// not punctuation. Preserves dimension-like tokens (3x3, 30x30, 700d, 28cm).
function isSignificant(tok) {
  if (!tok || tok.length < MIN_TOKEN_LEN || tok.length > MAX_TOKEN_LEN) return false;
  if (STOP_SET.has(tok)) return false;
  // Pure number is allowed only if it has a unit suffix (kept by tokenize because we kept digits)
  // Standalone integers like "10" get filtered — usually quantity noise
  if (/^\d+$/.test(tok) && tok.length < 4) return false;
  return true;
}

// Heuristic: a candidate is "commercial-meaningful" if it has 2-5 tokens,
// at least one is significant, and it doesn't start with an informational verb.
const INFO_PREFIXES = /^(cum|ce|de\s+ce|cand|unde|cine)\s/i;
const TOO_SHORT_MIN = 2;
const TOO_LONG_MAX  = 6;

function isViableCandidate(kw) {
  if (!kw) return false;
  const tokens = tokenize(kw);
  if (tokens.length < TOO_SHORT_MIN || tokens.length > TOO_LONG_MAX) return false;
  if (INFO_PREFIXES.test(kw)) return false;
  // At least 60% of tokens must be significant
  const sig = tokens.filter(isSignificant).length;
  if (sig / tokens.length < 0.6) return false;
  // Reject if ANY token repeats — synonym expansion can produce "acoperis
  // acoperis cort" or "sticker perete autoadeziv perete". These look like
  // keyword-stuffed garbage to Google and should never be primary keywords.
  if (new Set(tokens).size !== tokens.length) return false;
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// SOURCE 1 — AI Extract v2 (Claude Sonnet, uses normalized title)
// ────────────────────────────────────────────────────────────────────────────
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const FETCH_TIMEOUT_MS  = 45_000;
const QUALITY_MODEL = process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6";

async function callClaude(systemPrompt, userPrompt, model = QUALITY_MODEL, maxTokens = 800) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").replace(/[^\x21-\x7E]/g, "");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const ac = new AbortController();
  const t  = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      signal: ac.signal,
      body: JSON.stringify({
        model, max_tokens: maxTokens,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`Anthropic ${resp.status}: ${t.slice(0, 200)}`);
    }
    const data = await resp.json();
    return (data.content?.[0]?.text || "").trim();
  } finally {
    clearTimeout(t);
  }
}

const AI_SYSTEM = "Expert SEO keyword research pentru e-commerce Romania. Returnezi DOAR JSON array de strings, fara explicatii, fara markdown.";

const AI_CACHE_TTL_DAYS = 60;

// Cluster-level normalization for AI cache. Strips attributes that don't
// affect keyword research (color, size, set quantity, brand-noise, generic
// connectors). Keeps the semantic essence so all variants of the same
// product type hash to the same cache key.
//
// Example: "Kendama Pro Vivimall Lemn Rubber Grip 18 cm Roz/Mov/Albastru"
//       → "kendama pro lemn rubber grip" → hash X
//          "Kendama Pro Vivimall Lemn Rubber Grip 18 cm Negru/Maro/Alb"
//       → "kendama pro lemn rubber grip" → hash X (SAME)
const CACHE_COLORS = [
  // RO
  "alb", "alba", "albe", "negru", "neagra", "negre", "rosu", "rosie", "rosii",
  "albastru", "albastra", "albastre", "verde", "verzi", "galben", "galbena", "galbene",
  "gri", "auriu", "argintiu", "bej", "roz", "violet", "violeta", "mov",
  "portocaliu", "portocalie", "maro", "crem", "ivoriu", "lila", "turcoaz",
  "multicolor", "fade",
  // EN that might leak into RO titles
  "white", "black", "blue", "red", "green", "yellow", "grey", "gray",
  "gold", "silver", "beige", "pink", "purple", "orange", "brown",
];

const CACHE_NOISE = [
  "din", "cu", "de", "la", "pe", "in", "pentru", "fara", "intre", "prin",
  "vivimall", "si", "sau",
  // Secondary modifiers — strip so near-variants of same product cluster together.
  // Before this list: "Pietre" and "Pietre Mici" produced different cluster hashes,
  // wasting AI Extract calls on near-duplicate products.
  "mici", "mare", "mari", "mediu", "medie", "medii",
  "v1", "v2", "v3", "v4",
  "asimetrica", "asimetric", "rotund", "rotunda", "patrat", "patrata",
  "set", "kit", "pack",
];

function clusterHash(text, language = "ro") {
  let s = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  // Strip dimensions: 30x30, 12.5x7.2, 3x3m, 28cm, 180kg, 2880 lumeni, etc.
  s = s.replace(/\b\d+(?:[.,]\d+)?(?:\s*x\s*\d+(?:[.,]\d+)?)*(?:\s*(?:cm|mm|m|kg|g|ml|l|w|v|ah|hz|inch|inches|grade|cubici|lumeni|led|mp))?\b/gi, " ");
  s = s.replace(/\b\d+\/\d+\b/g, " ");  // ratios "3/4"

  // Strip set quantities + standalone numbers
  s = s.replace(/\bset\s+\d+\b/gi, " ");
  s = s.replace(/\b\d+\s*(?:buc|bucati|piese)\b/gi, " ");
  s = s.replace(/\b\d+\b/g, " ");

  // Strip colors (word boundary)
  for (const c of CACHE_COLORS) {
    s = s.replace(new RegExp(`\\b${c}\\b`, "gi"), " ");
  }

  // Strip generic connectors and noise tokens (incl. brand name)
  for (const w of CACHE_NOISE) {
    s = s.replace(new RegExp(`\\b${w}\\b`, "gi"), " ");
  }

  // Strip separators (slashes, dashes, pipes from "Roz/Mov/Albastru")
  s = s.replace(/[/\\|·•—–\-]/g, " ");

  // Strip non-alpha-numeric (commas, dots, parens, etc.)
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");

  // Collapse whitespace + tokenize + filter short
  const tokens = s.split(/\s+/).filter(t => t.length >= 3);

  // Sort tokens: cluster hash should be order-independent
  // ("tigaie fonta" and "fonta tigaie" describe same cluster)
  tokens.sort();

  // Dedupe
  const unique = Array.from(new Set(tokens));

  const canonical = unique.join(" ") + "|" + language;
  return fnv1a(canonical);
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Export so tests + tooling can call directly
export { clusterHash };

function buildAiPrompt(normalizedTitle, productType, vendor) {
  return `Extrage 12-15 candidati keyword COMERCIALI pentru SEO din titlul de mai jos.

TITLU: ${normalizedTitle}
${productType ? `TIP PRODUS: ${productType}\n` : ""}${vendor ? `BRAND: ${vendor}\n` : ""}
REGULI:
- DOAR keyword-uri TRANSACTIONAL / COMMERCIAL (cumparare, comparare)
- NU informational ("cum sa", "ce este", "ghid")
- 2-5 cuvinte per keyword, fara virgule, fara stop-words
- Forme commerciale RO: "{tip_produs} {atribut}", "{tip_produs} {use_case}",
  "{tip_produs} {atribut} {use_case}", "{tip_produs} {dimensiune}",
  "{adjectiv} {tip_produs}", "set {tip_produs}", "{brand} {tip_produs}"
- Include atat HEAD term-uri scurte (2 cuvinte, vol mare) cat si MID-tail (3 cuvinte)
- Atat varianta cu BRAND cat si FĂRĂ brand
- Diversifica: nu repeta acelasi pattern de 5x

EXEMPLE BUNE:
Pentru "Placi Tapet 3D Marmura Autoadeziv 30x30 Alb Negru":
["tapet 3d marmura", "tapet autoadeziv", "tapet autoadeziv bucatarie",
 "placi tapet marmura", "tapet 3d perete", "tapet autocolant",
 "tapet marmura 30x30", "tapet imitatie marmura", "stickere marmura",
 "tapet autoadeziv perete", "decor perete marmura", "tapet 3d"]

Pentru "Prelata Acoperis Cort 3X3M Impermeabila FlexiCover":
["prelata cort 3x3", "prelata cort", "prelata impermeabila",
 "prelata pavilion", "copertina cort", "acoperis cort",
 "prelata 3x3", "cort 3x3 impermeabil", "prelata cort pavilion",
 "prelata acoperis", "umbrar cort", "prelata gradina"]

Returneaza STRICT JSON array, ex: ["keyword1", "keyword2", ...]`;
}

async function discoverViaAi({ normalizedTitle, originalTitle, productType, vendor, language = "ro" }) {
  // Hash from ORIGINAL title — title normalizer can produce slightly different
  // outputs for sibling products (Claude Haiku is non-deterministic enough that
  // "Kendama Rubber Grip 18cm Vivimall" and "Kendama Profesionala Lemn 18cm
  // Vivimall" can come from the same family of products). Raw title hashing is
  // more stable for cluster detection because clusterHash() strips all the
  // variability anyway (color, size, brand, connectors).
  const hash = clusterHash(originalTitle || normalizedTitle, language);

  // Cache check (global, cross-store). Same cluster across merchants benefits.
  const cached = await prisma.seoAiExtractCache.findUnique({
    where: { clusterHash: hash },
  }).catch(() => null);

  if (cached && cached.expiresAt > new Date()) {
    // Track usage — non-blocking update
    prisma.seoAiExtractCache.update({
      where: { id: cached.id },
      data:  { hitCount: { increment: 1 }, lastUsedAt: new Date() },
    }).catch(() => {});
    return {
      candidates: Array.isArray(cached.candidates) ? cached.candidates : [],
      source:     "cache_hit",
      hash,
    };
  }

  // Miss — call Claude
  const raw = await callClaude(AI_SYSTEM, buildAiPrompt(normalizedTitle, productType, vendor));
  const m = raw.match(/\[[\s\S]*?\]/);
  let candidates = [];
  if (m) {
    try {
      const arr = JSON.parse(m[0]);
      candidates = Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
    } catch {}
  }

  // Cache the result (fire-and-forget — don't block request on cache write)
  if (candidates.length > 0) {
    prisma.seoAiExtractCache.upsert({
      where:  { clusterHash: hash },
      create: {
        clusterHash: hash,
        sampleTitle: normalizedTitle,
        language,
        candidates,
        aiModel:     QUALITY_MODEL,
        expiresAt:   new Date(Date.now() + AI_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
      update: {
        sampleTitle: normalizedTitle,
        candidates,
        aiModel:     QUALITY_MODEL,
        lastUsedAt:  new Date(),
        expiresAt:   new Date(Date.now() + AI_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    }).catch(e => console.warn("[KeywordDiscovery] cache upsert failed:", e.message));
  }

  return { candidates, source: "fresh", hash };
}

// ────────────────────────────────────────────────────────────────────────────
// SOURCE 2 — Pattern combinatorial (rule-based, no AI)
// Builds 2-grams and 3-grams from significant tokens. Filters via stop-words.
// ────────────────────────────────────────────────────────────────────────────
export function discoverViaPattern(text, { max = 30 } = {}) {
  const tokens = tokenize(text).filter(isSignificant);
  if (tokens.length === 0) return [];

  const out = new Set();

  // 2-grams (adjacent pairs)
  for (let i = 0; i < tokens.length - 1; i++) {
    out.add(`${tokens[i]} ${tokens[i + 1]}`);
  }

  // 3-grams (adjacent triples) — typically more commercial than 4-grams
  for (let i = 0; i < tokens.length - 2; i++) {
    out.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  }

  // Common commercial patterns — skip non-adjacent if first token is the
  // "head" (typically first token in product title) + key attribute
  if (tokens.length >= 3) {
    const head = tokens[0];
    for (let i = 1; i < Math.min(tokens.length, 6); i++) {
      out.add(`${head} ${tokens[i]}`);
      if (i + 1 < tokens.length) {
        out.add(`${head} ${tokens[i]} ${tokens[i + 1]}`);
      }
    }
  }

  return Array.from(out).slice(0, max);
}

// ────────────────────────────────────────────────────────────────────────────
// SOURCE 3 — Synonym expansion
// For each candidate, try replacing tokens with their synonyms.
// Only emits NEW combinations (not the original).
// ────────────────────────────────────────────────────────────────────────────
export function discoverViaSynonyms(candidates, { maxPerCandidate = 3 } = {}) {
  const out = new Set();

  for (const kw of candidates) {
    const tokens = kw.split(/\s+/);
    let emittedForThis = 0;

    for (let i = 0; i < tokens.length; i++) {
      const syns = SYNONYM_MAP.get(tokens[i]);
      if (!syns) continue;
      for (const syn of syns) {
        if (emittedForThis >= maxPerCandidate) break;
        const newTokens = tokens.slice();
        newTokens[i] = syn;
        const newKw = newTokens.join(" ").toLowerCase();
        if (newKw === kw.toLowerCase()) continue;
        out.add(newKw);
        emittedForThis++;
      }
      if (emittedForThis >= maxPerCandidate) break;
    }
  }
  return Array.from(out);
}

// ────────────────────────────────────────────────────────────────────────────
// SOURCE 4 — GSC Mining
// Pulls all queries that ranked the product URL in the last GSC sync.
// Filters: ≥10 impressions (ignore noise) + non-branded competitor queries.
// ────────────────────────────────────────────────────────────────────────────
const COMPETITOR_TOKENS = ["dedeman", "leroy merlin", "brico depot", "ikea", "jumbo", "kaufland", "auchan", "emag", "altex"];

export async function discoverViaGsc(storeId, productId, { minImpressions = 10, max = 20 } = {}) {
  const rows = await prisma.seoGscData.findMany({
    where: {
      storeId, productId,
      impressions: { gte: minImpressions },
    },
    orderBy: { impressions: "desc" },
    take: max * 2, // overfetch so we can filter
    select: { query: true, impressions: true, position: true },
  });

  return rows
    .map(r => r.query.toLowerCase())
    .filter(q => !COMPETITOR_TOKENS.some(c => q.includes(c)))
    .slice(0, max);
}

// ────────────────────────────────────────────────────────────────────────────
// SOURCE 5 — Cross-product borrowing
// Finds sibling products (same aiTag OR similar title) and borrows their
// top GSC queries + DFS-enriched keywords. Critical for new products
// without any GSC history.
//
// Output is filtered to keywords sharing ≥1 significant token with the
// target product title. Without this filter, a "Cutie depozitare pliabila"
// product borrows "organizator medicamente" (4400 vol) from a "Cutie
// organizator medicamente" sibling — both start with "Cutie", but the
// keyword is wrong-intent. Token overlap eliminates this contamination
// without harming legitimate borrows (e.g., "kendama originala" survives
// because "kendama" + "originala" are both in the target title).
// ────────────────────────────────────────────────────────────────────────────

// Light RO suffix stripper for cross-product overlap (independent of ecs-scorer
// to avoid circular deps; same heuristic).
const CP_SUFFIXES = ["urilor","elor","ului","ilor","ele","uri","ile","le","ei","ea","or","ul","ii","ie","iu","es","e","i","a"];
function cpLemma(t) {
  if (!t || t.length < 4) return t;
  for (const s of CP_SUFFIXES) {
    if (t.endsWith(s) && t.length - s.length >= 3) return t.slice(0, -s.length);
  }
  return t;
}

export async function discoverViaCrossProduct(storeId, product, { max = 10 } = {}) {
  // Strategy 1: same aiTag — fast lookup
  let siblings = [];
  if (product.aiTag) {
    siblings = await prisma.seoProduct.findMany({
      where: { storeId, aiTag: product.aiTag, productId: { not: product.productId } },
      select: { productId: true },
      take: 20,
    });
  }

  // Strategy 2: fallback to first-token match (works when aiTag is null)
  if (siblings.length === 0) {
    const firstToken = tokenize(product.productTitle)[0];
    if (firstToken && firstToken.length >= 4) {
      siblings = await prisma.seoProduct.findMany({
        where: {
          storeId,
          productId: { not: product.productId },
          productTitle: { startsWith: firstToken, mode: "insensitive" },
        },
        select: { productId: true },
        take: 20,
      });
    }
  }

  if (siblings.length === 0) return [];

  const siblingIds = siblings.map(s => s.productId);

  // Pool 1: their GSC queries
  const gscRows = await prisma.seoGscData.findMany({
    where: { storeId, productId: { in: siblingIds }, impressions: { gte: 20 } },
    orderBy: { impressions: "desc" },
    take: max * 3,
    select: { query: true },
  });

  // Pool 2: their existing DFS-enriched candidates with real volume
  const dfsRows = await prisma.seoCandidate.findMany({
    where: { storeId, productId: { in: siblingIds }, volume: { gte: 50 } },
    orderBy: { volume: "desc" },
    take: max * 2,
    select: { keyword: true },
  });

  const set = new Set();
  for (const r of gscRows) set.add(r.query.toLowerCase());
  for (const r of dfsRows) set.add(r.keyword.toLowerCase());

  // Token-overlap filter: require ≥1 significant token shared with target title.
  // Tokens compared via lemma (strips RO suffixes) so plural/gender variants match.
  const targetTokenLemmas = new Set(
    tokenize(product.productTitle).filter(isSignificant).map(cpLemma)
  );

  return Array.from(set)
    .filter(k => !COMPETITOR_TOKENS.some(c => k.includes(c)))
    .filter(k => {
      const kwTokens = tokenize(k).filter(isSignificant).map(cpLemma);
      return kwTokens.some(t => targetTokenLemmas.has(t));
    })
    .slice(0, max);
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN ORCHESTRATOR
// ────────────────────────────────────────────────────────────────────────────
export async function discoverCandidatesForProduct(storeId, product, opts = {}) {
  const {
    useAi          = true,
    useGsc         = true,
    useCrossProduct = true,
    useSynonyms    = true,
  } = opts;

  // Stage 1: get normalized title (cached via title-normalizer)
  let normalizedTitle = product.productTitle;
  let normInfo = { used: "passthrough" };
  try {
    const nt = await getNormalizedTitle(product.productId, storeId);
    if (nt?.title) {
      normalizedTitle = nt.title;
      normInfo = { used: nt.cached ? "cached" : "fresh", title: nt.title };
    }
  } catch (e) {
    // Title normalization failed (no AI credit, network, etc.) — fall back to original
    normInfo = { used: "fallback_original", error: e.message };
  }

  const sources = { ai: [], pattern: [], synonym: [], gsc: [], crossProduct: [] };
  const errors = {};
  let aiCache = null;

  // Source 1: AI Extract v2 (with cluster-hash cache)
  if (useAi) {
    try {
      const aiRes = await discoverViaAi({
        normalizedTitle,
        originalTitle: product.productTitle,
        productType:   product.productType,
        vendor:        product.vendor,
      });
      sources.ai = aiRes.candidates;
      aiCache    = { source: aiRes.source, hash: aiRes.hash };
    } catch (e) {
      errors.ai = e.message;
    }
  }

  // Source 2: Pattern (no AI, can't fail)
  sources.pattern = discoverViaPattern(normalizedTitle);

  // Source 3: Synonyms (on union of ai + pattern)
  if (useSynonyms) {
    const baseForSynonyms = [...sources.ai, ...sources.pattern];
    sources.synonym = discoverViaSynonyms(baseForSynonyms);
  }

  // Source 4: GSC Mining
  if (useGsc) {
    try {
      sources.gsc = await discoverViaGsc(storeId, product.productId);
    } catch (e) {
      errors.gsc = e.message;
    }
  }

  // Source 5: Cross-product borrowing
  if (useCrossProduct) {
    try {
      sources.crossProduct = await discoverViaCrossProduct(storeId, product);
    } catch (e) {
      errors.crossProduct = e.message;
    }
  }

  // Dedupe + viability filter
  const seen = new Set();
  const final = [];
  for (const src of ["gsc", "ai", "pattern", "synonym", "crossProduct"]) {
    // Order matters: GSC > AI > Pattern so attribution tracks the most authoritative source
    for (const raw of sources[src]) {
      const norm = normalizeKeyword(raw);
      if (!norm || seen.has(norm)) continue;
      if (!isViableCandidate(norm)) continue;
      seen.add(norm);
      final.push({ keyword: norm, source: src });
    }
  }

  return {
    candidates:        final,
    normalizedTitle:   normInfo,
    aiCache,
    sourceCounts:      Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v.length])),
    sourceCountsFinal: final.reduce((acc, c) => { acc[c.source] = (acc[c.source] || 0) + 1; return acc; }, {}),
    errors,
    totalUnique:       final.length,
  };
}
