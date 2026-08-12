// app/lib/seo/ecs-scorer.server.js
// Sprint 4 — Expected Click Score (ECS) Algorithm
//
// ECS = volume × CTR(realistic_pos) × intent × title_compat × ranking_safety
//
// Ground truth: GSC position (NOT DFS KD). DFS KD is calibrated on global
// SERPs, but RO niche SERPs are permeable (lavessi.ro DR 0 ranks pos 2 on KD 43).

import prisma from "../../db.server.js";

// ─── CTR CURVE (2025 organic benchmarks) ───
const CTR_CURVE = {
  1: 0.190, 2: 0.126, 3: 0.085, 4: 0.060, 5: 0.045,
  6: 0.034, 7: 0.026, 8: 0.020, 9: 0.018, 10: 0.015,
  11: 0.012, 12: 0.010, 13: 0.009, 14: 0.008, 15: 0.008,
  16: 0.006, 17: 0.005, 18: 0.004, 19: 0.003, 20: 0.003,
};

function ctrAtPosition(pos) {
  const p = Math.max(1, Math.round(pos));
  if (p <= 20) return CTR_CURVE[p];
  if (p <= 30) return 0.002;
  return 0.001;
}

// ─── REALISTIC POSITION (with improvement band) ───
// How much can we realistically improve from current position?
function realisticPosition(currentPos) {
  if (!currentPos || currentPos <= 0) return 20; // no GSC data → conservative
  if (currentPos <= 5)  return Math.max(1, currentPos - 2);
  if (currentPos <= 15) return Math.max(1, currentPos - 5);
  if (currentPos <= 30) return Math.max(1, currentPos - 10);
  return 25; // pos 30+ → cap at 25 (speculative)
}

// ─── INTENT CLASSIFICATION ───
const INFORMATIONAL_PATTERNS = /^(ce este|cum se|de ce|cand|unde|cine|what is|how to|why|when|where|who)/i;
const NAVIGATIONAL_PATTERNS  = /\.(ro|com|net|org)|facebook|youtube|instagram|amazon|emag|altex/i;

function intentMultiplier(keyword, kwType) {
  if (kwType === "informational") return 0;
  if (INFORMATIONAL_PATTERNS.test(keyword)) return 0;
  if (kwType === "navigational" || NAVIGATIONAL_PATTERNS.test(keyword)) return 0.7;
  return 1.0; // transactional / commercial
}

// ─── TOKENIZATION + MORPHOLOGY (RO) ───
// titleCompat() previously used naive substring includes() which misses:
//  - diacritics ("marmură" vs "marmura")
//  - regular plurals ("autoadeziv" vs "autoadezive")
//  - irregular plurals ("piatra" vs "pietre", "carte" vs "carti")
// We strip diacritics, lemmatize (suffix-strip), and fall back to consonant
// skeleton for irregular plurals where the stem vowel changes.
function stripDiacritics(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function tokenizeForCompat(s) {
  return stripDiacritics(String(s || "").toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(t => t.length >= 3);
}

const RO_SUFFIXES = ["urilor", "elor", "ului", "ilor", "ele", "uri", "ile", "le", "ei", "ea", "or", "ul", "ii", "ie", "iu", "es", "e", "i", "a"];
function lemmatize(token) {
  if (!token || token.length < 4) return token;
  for (const suf of RO_SUFFIXES) {
    if (token.endsWith(suf) && token.length - suf.length >= 3) return token.slice(0, -suf.length);
  }
  return token;
}

function consonantSkeleton(token) {
  if (!token || token.length < 4) return token;
  return token.replace(/[aeiouy]/g, "");
}

function tokensMatch(a, b) {
  if (a === b) return true;
  const la = lemmatize(a), lb = lemmatize(b);
  if (la === lb) return true;
  const ca = consonantSkeleton(la), cb = consonantSkeleton(lb);
  if (ca.length >= 3 && ca === cb) return true;
  return false;
}

// ─── HARD CATEGORY MODIFIERS ───
// Tokens that fundamentally change product type. If present in a keyword but
// absent from the target title, the keyword is a wrong-fit regardless of
// other token overlap. Without this, "trotineta electrica" (74k vol) wins
// ECS for a manual kids scooter just because "trotineta" overlaps.
//
// Defined as lemma roots (lemmatized form). Sibling variants (electrica /
// electrice / electron) all collapse to the same lemma so we don't need to
// list every plural/gender form. Prefix match handles compound words like
// "smart" matching "smartphone" — without it, blocking smart-modifier
// keywords against smartphone titles would false-positive.
const HARD_CATEGORY_RAW = [
  "electric", "electrica", "electrice", "electron",
  "manual", "manuala", "manuale",
  "automat", "automata", "automate",
  "magnetic", "magnetica", "magnetice",
  "smart", "wifi", "bluetooth", "wireless",
  "incarcabil", "incarcabila", "incarcabili",
  "barbati", "femei", "fete", "baieti", "adulti", "bebelusi",
];
const HARD_CATEGORY_LEMMAS = new Set(HARD_CATEGORY_RAW.map(lemmatize));

export function hasUnmatchedHardModifier(keyword, productTitle) {
  if (!keyword || !productTitle) return false;
  const kwLemmas    = tokenizeForCompat(keyword).map(lemmatize);
  const titleLemmas = tokenizeForCompat(productTitle).map(lemmatize);

  return kwLemmas.some(kt => {
    if (!HARD_CATEGORY_LEMMAS.has(kt)) return false;
    // Found a hard-category lemma in keyword. Check if title carries it —
    // exact match OR any title token starts with this lemma (so "smart"
    // counts as covered when title has "smartphone").
    return !titleLemmas.some(tt => tt === kt || tt.startsWith(kt));
  });
}

// ─── TITLE COMPATIBILITY ───
function titleCompat(keyword, productTitle) {
  if (!keyword || !productTitle) return 0.7;
  const kwTokens    = tokenizeForCompat(keyword);
  const titleTokens = tokenizeForCompat(productTitle);
  if (kwTokens.length === 0) return 1.0;
  const matchCount = kwTokens.filter(kt => titleTokens.some(tt => tokensMatch(kt, tt))).length;
  const ratio = matchCount / kwTokens.length;
  if (ratio >= 1.0) return 1.3;  // all tokens present
  if (ratio >= 0.66) return 1.0; // most tokens (2/3 or better)
  return 0.3;                    // poor fit — strong wrong-signal penalty
}

// ─── RANKING SAFETY ───
function rankingSafety(difficulty, gscPosition) {
  if (gscPosition && gscPosition < 10) return 1.0; // already ranking well
  if (!difficulty || difficulty < 30) return 1.0;
  if (difficulty <= 60) return 0.8;
  if (gscPosition) return 0.7; // high KD but have GSC signal
  return 0.5; // high KD + no GSC = pure speculation
}

// ─── CORE ECS COMPUTATION ───
export function computeECS({ volume, difficulty, position, serpFeatures, keyword, productTitle, kwType }) {
  if (!volume || volume <= 0) return { ecs: 0, realisticPos: null, blocked: "no_volume" };

  // Intent gate — hard zero for informational
  const intent = intentMultiplier(keyword, kwType);
  if (intent === 0) return { ecs: 0, realisticPos: null, blocked: "informational" };

  // Hard category gate — hard zero when keyword carries a product-type
  // modifier (electric/manual/smart/etc.) that the title doesn't claim.
  if (hasUnmatchedHardModifier(keyword, productTitle)) {
    return { ecs: 0, realisticPos: null, blocked: "category_mismatch" };
  }

  const realPos   = realisticPosition(position);
  const ctr       = ctrAtPosition(realPos);
  const titleMult = titleCompat(keyword, productTitle);
  const safety    = rankingSafety(difficulty, position);

  // AIO penalty: 0.42× if SERP has AI Overview
  const features = typeof serpFeatures === "string" ? JSON.parse(serpFeatures || "[]") : (serpFeatures || []);
  const aioPenalty = features.includes("ai_overview") ? 0.42 : 1.0;

  const ecs = volume * ctr * intent * titleMult * safety * aioPenalty;

  return {
    ecs: Math.round(ecs * 1000) / 1000,
    realisticPos: realPos,
    ctr,
    intent,
    titleMult,
    safety,
    aioPenalty,
    blocked: null,
  };
}

// ─── SCORE ALL CANDIDATES FOR ONE PRODUCT ───
export async function scoreAllCandidatesForProduct(storeId, productId) {
  // Get enriched candidates
  const candidates = await prisma.seoCandidate.findMany({
    where: { storeId, productId, enrichedAt: { not: null } },
    select: {
      id: true, keyword: true, keywordNorm: true, productTitle: true,
      volume: true, difficulty: true, cpc: true, competition: true,
      serpFeatures: true, score: true,
    },
  });

  if (candidates.length === 0) return [];

  // Get GSC data for this product
  const { getGscDataForProduct } = await import("./gsc-sync.server.js");
  const gscRows = await getGscDataForProduct(storeId, productId).catch(() => []);

  // Build keyword → GSC position map
  const gscMap = new Map();
  for (const row of gscRows) {
    const existing = gscMap.get(row.query);
    if (!existing || row.impressions > existing.impressions) {
      gscMap.set(row.query, row);
    }
  }

  // Score each candidate
  const scored = candidates.map(c => {
    const gsc = gscMap.get(c.keyword.toLowerCase()) || gscMap.get(c.keywordNorm) || null;
    const result = computeECS({
      volume:       c.volume || 0,
      difficulty:   c.difficulty || 0,
      position:     gsc?.position || null,
      serpFeatures: c.serpFeatures,
      keyword:      c.keyword,
      productTitle: c.productTitle,
      kwType:       classifyIntent(c.keyword),
    });

    return {
      candidateId: c.id,
      keyword:     c.keyword,
      keywordNorm: c.keywordNorm,
      volume:      c.volume || 0,
      difficulty:  c.difficulty || 0,
      gscPosition: gsc?.position || null,
      gscClicks:   gsc?.clicks || 0,
      gscImpr:     gsc?.impressions || 0,
      ...result,
    };
  });

  // Sort by ECS descending
  scored.sort((a, b) => b.ecs - a.ecs);
  return scored;
}

// Simple intent classifier from keyword text
function classifyIntent(keyword) {
  if (!keyword) return "transactional";
  const kw = keyword.toLowerCase();
  if (INFORMATIONAL_PATTERNS.test(kw)) return "informational";
  if (NAVIGATIONAL_PATTERNS.test(kw)) return "navigational";
  return "transactional";
}

// ─── BATCH SCORE + PERSIST ───
// Score all candidates for multiple products, persist ecsScore + ecsPosition
export async function batchScoreProducts(storeId, productIds) {
  let scored = 0;
  for (const productId of productIds) {
    const results = await scoreAllCandidatesForProduct(storeId, productId);
    if (results.length === 0) continue;

    // Batch update ecsScore + ecsPosition
    for (const r of results) {
      await prisma.seoCandidate.update({
        where: { id: r.candidateId },
        data: {
          ecsScore:    r.ecs,
          ecsPosition: r.realisticPos,
        },
      }).catch(() => {});
    }
    scored += results.length;
  }
  return scored;
}

export { ctrAtPosition, realisticPosition, CTR_CURVE };
