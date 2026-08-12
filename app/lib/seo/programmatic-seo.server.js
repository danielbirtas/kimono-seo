// app/lib/seo/programmatic-seo.server.js
// Kimono SEO — Programmatic SEO module (pSEO)
// Generates template-based landing pages at scale for Shopify merchants.

import crypto from "crypto";
import prisma from "../../db.server.js";
import { detectYmyl, detectYmylForTemplate } from "./ymyl-detector.server.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────────────────────

const PATTERN_DEFAULTS = {
  BEST_X_FOR_Y: {
    name: "Cele mai bune {productType} pentru {useCase}",
    urlPattern: "/pages/cele-mai-bune-{productType}-pentru-{useCase}",
    titleTpl: "Cele mai bune {productType} pentru {useCase} — 2026",
    metaTpl: "Descoperă top {productType} pentru {useCase}. Recomandări verificate, preț bun, livrare rapidă.",
    h1Tpl: "Cele mai bune {productType} pentru {useCase}",
    keywordTpl: "cele mai bune {productType} pentru {useCase}",
  },
  ATTRIBUTE_X: {
    name: "{attribute} {productType}",
    urlPattern: "/pages/{attribute}-{productType}",
    titleTpl: "{attribute} {productType} — colecție {year}",
    metaTpl: "Vezi selecția de {attribute} {productType}. Stoc variat, preț corect, retur gratuit.",
    h1Tpl: "{attribute} {productType}",
    keywordTpl: "{attribute} {productType}",
  },
  X_VS_Y: {
    name: "{productA} vs {productB}",
    urlPattern: "/pages/{productA}-vs-{productB}",
    titleTpl: "{productA} vs {productB} — ce să alegi în 2026",
    metaTpl: "Comparație detaliată între {productA} și {productB}: preț, calitate, avantaje.",
    h1Tpl: "{productA} vs {productB}: ghid comparativ",
    keywordTpl: "{productA} vs {productB}",
  },
  X_UNDER_PRICE: {
    name: "{productType} sub {priceLimit} lei",
    urlPattern: "/pages/{productType}-sub-{priceLimit}-lei",
    titleTpl: "{productType} sub {priceLimit} lei — ofertele noastre",
    metaTpl: "Top {productType} cu preț sub {priceLimit} lei. Calitate bună, livrare rapidă.",
    h1Tpl: "{productType} sub {priceLimit} lei",
    keywordTpl: "{productType} sub {priceLimit} lei",
  },
  GIFT_GUIDE: {
    name: "Cadouri pentru {recipient} de {occasion}",
    urlPattern: "/pages/cadouri-pentru-{recipient}-de-{occasion}",
    titleTpl: "Cadouri pentru {recipient} de {occasion} — idei 2026",
    metaTpl: "Idei de cadouri pentru {recipient} cu ocazia {occasion}. Selecție curată, toate bugetele.",
    h1Tpl: "Cadouri pentru {recipient} de {occasion}",
    keywordTpl: "cadouri {recipient} {occasion}",
  },
  X_IN_LOCATION: {
    name: "{productType} în {location}",
    urlPattern: "/pages/{productType}-in-{location}",
    titleTpl: "{productType} în {location} — magazin online cu livrare",
    metaTpl: "Cumpără {productType} în {location} de la magazinul nostru. Livrare rapidă, retur gratuit, plata ramburs.",
    h1Tpl: "{productType} în {location}",
    keywordTpl: "{productType} in {location}",
  },
};

// Top 32 Romanian cities by population + commercial relevance. Used by the
// X_IN_LOCATION pattern. Diacritics omitted from values so they slug
// cleanly; the title/meta templates regenerate the natural form.
const RO_CITIES = [
  "bucuresti", "cluj", "timisoara", "iasi", "constanta", "craiova", "brasov",
  "galati", "ploiesti", "oradea", "braila", "arad", "pitesti", "sibiu",
  "bacau", "targu mures", "baia mare", "buzau", "satu mare", "botosani",
  "ramnicu valcea", "suceava", "piatra neamt", "drobeta turnu severin",
  "focsani", "targoviste", "tulcea", "resita", "bistrita", "slatina",
  "calarasi", "alba iulia",
];

function substituteTokens(tpl, tokens, extras = {}) {
  const all = { ...extras, year: new Date().getFullYear(), ...tokens };
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => all[k] ?? "");
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function cartesian(dicts) {
  const keys = Object.keys(dicts);
  if (keys.length === 0) return [];
  let result = [{}];
  for (const k of keys) {
    const vals = dicts[k] || [];
    if (!Array.isArray(vals) || vals.length === 0) continue;
    result = result.flatMap((row) => vals.map((v) => ({ ...row, [k]: v })));
  }
  return result;
}

function hashContent(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 16);
}

function wordCount(s) {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function createTemplate(storeId, input) {
  const pattern = input.pattern || "BEST_X_FOR_Y";
  const d = PATTERN_DEFAULTS[pattern] || PATTERN_DEFAULTS.BEST_X_FOR_Y;

  // YMYL guard — Google SQRG §2.3 + scaled-content policy. Refuse to be the
  // source of low-effort AI-templated pages on health, finance, law, etc.
  // The merchant can still author these manually; we just won't pSEO them.
  const tplProbe = {
    name:        input.name || d.name,
    titleTpl:    input.titleTpl   || d.titleTpl,
    metaTpl:     input.metaTpl    || d.metaTpl,
    h1Tpl:       input.h1Tpl      || d.h1Tpl,
    urlPattern:  input.urlPattern || d.urlPattern,
    tokenDictsJson: input.tokenDicts || {},
  };
  const ymyl = detectYmylForTemplate(tplProbe);
  if (ymyl.isYmyl) {
    const err = new Error(
      `YMYL content not supported in pSEO. Template touches ${ymyl.category} ` +
      `(matched: ${ymyl.matchedStems.join(", ")}). These topics need first-hand ` +
      `expertise and manual editorial review per Google E-E-A-T standards. ` +
      `Please write manually.`
    );
    err.code = "YMYL_BLOCKED";
    err.category = ymyl.category;
    err.matchedStems = ymyl.matchedStems;
    throw err;
  }

  return prisma.pSeoTemplate.create({
    data: {
      storeId,
      name:            input.name || d.name,
      pattern,
      urlPattern:      input.urlPattern || d.urlPattern,
      titleTpl:        input.titleTpl   || d.titleTpl,
      metaTpl:         input.metaTpl    || d.metaTpl,
      h1Tpl:           input.h1Tpl      || d.h1Tpl,
      tokenDictsJson:  input.tokenDicts || {},
      aiPromptJson:    input.aiPrompt   || null,
      publishTarget:   input.publishTarget || "METAOBJECT",
      minSearchVolume: input.minSearchVolume ?? 20,
      maxKd:           input.maxKd ?? 40,
      minProductCount: input.minProductCount ?? 4,
      maxRows:         input.maxRows ?? 500,
    },
  });
}

export async function updateTemplate(templateId, input) {
  return prisma.pSeoTemplate.update({
    where: { id: templateId },
    data: input,
  });
}

export async function listTemplates(storeId) {
  return prisma.pSeoTemplate.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { rows: true, batches: true } },
    },
  });
}

export async function getTemplate(templateId) {
  return prisma.pSeoTemplate.findUnique({
    where: { id: templateId },
    include: { _count: { select: { rows: true } } },
  });
}

export async function deleteTemplate(templateId) {
  return prisma.pSeoTemplate.delete({ where: { id: templateId } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Row generation from tokens
// ─────────────────────────────────────────────────────────────────────────────

// Normalize text for fuzzy matching: lowercase + strip Romanian diacritics.
function normText(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Romanian morphology defeats literal substring matching: "benzi adezive"
// (plural, tag-style) doesn't appear in a product titled "Banda adeziva
// 2cm". We extract significant words from each token, take a 4-char stem
// from each, and a token matches a product if AT LEAST ONE of its stems
// appears in the (normalized) haystack. Combo matches if EVERY token
// finds at least one stem in the same product.
function tokenStems(token) {
  return normText(token)
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ""))
    .filter(w => w.length >= 4)
    .map(w => w.slice(0, 4));
}

function tokenHits(token, normHaystack) {
  const stems = tokenStems(token);
  if (stems.length === 0) {
    // Token is too short for stemming (e.g. "ea") — fall back to exact.
    return normHaystack.includes(normText(token));
  }
  return stems.some(s => normHaystack.includes(s));
}

// Load the catalog once. Returns normalized haystacks built from
// productTitle + aiTag + aiSub so stem matching is diacritic-insensitive.
async function loadCatalogHaystacks(storeId, take = 1000) {
  const products = await prisma.seoProduct.findMany({
    where: { storeId, status: { not: "deleted" } },
    select: { productTitle: true, aiTag: true, aiSub: true },
    take,
  }).catch(() => []);
  return products.map(p => normText([p.productTitle || "", p.aiTag || "", p.aiSub || ""].join(" ")));
}

function countCatalogMatches(haystacks, tokens) {
  // Skip purely numeric tokens (e.g. priceLimit) — they don't represent
  // catalog attributes, only filtering thresholds.
  const terms = Object.entries(tokens)
    .filter(([, v]) => isNaN(Number(v)))
    .map(([, v]) => String(v))
    .filter(Boolean);
  if (terms.length === 0) return haystacks.length;
  let n = 0;
  for (const h of haystacks) {
    if (terms.every(t => tokenHits(t, h))) n++;
  }
  return n;
}

function buildRowFromCombo(tpl, keywordTpl, tokens) {
  const targetKeyword = substituteTokens(keywordTpl, tokens).toLowerCase().trim();
  const slugTokens = Object.fromEntries(
    Object.entries(tokens).map(([k, v]) => [k, slugify(v)])
  );
  return {
    tokens,
    targetKeyword,
    url:   substituteTokens(tpl.urlPattern, slugTokens),
    title: substituteTokens(tpl.titleTpl, tokens).slice(0, 70),
    meta:  substituteTokens(tpl.metaTpl, tokens).slice(0, 160),
    h1:    substituteTokens(tpl.h1Tpl, tokens),
  };
}

// Resolve the combo list from a template: prefer explicit _pairs (catalog-
// driven, grounded) over cartesian (legacy global cross-product). Each pair
// already represents a validated (productType, useCase) — we trust it and
// only annotate with live catalog match counts at preview time.
function resolveCombos(tpl) {
  const dicts = tpl.tokenDictsJson || {};
  if (Array.isArray(dicts._pairs) && dicts._pairs.length > 0) {
    return dicts._pairs.map(p => {
      const t = { ...p };
      // Strip internal fields starting with _
      Object.keys(t).forEach(k => { if (k.startsWith("_")) delete t[k]; });
      return t;
    });
  }
  return cartesian(dicts);
}

// Build the preview list: every combo annotated with the number of catalog
// products that match all of its non-numeric tokens. Used by the dry-run UI
// before the merchant commits to inserting rows.
export async function previewRows(templateId, { minMatch = 1 } = {}) {
  const tpl = await prisma.pSeoTemplate.findUnique({ where: { id: templateId } });
  if (!tpl) throw new Error("Template not found");

  const d = PATTERN_DEFAULTS[tpl.pattern];
  const keywordTpl = d?.keywordTpl || tpl.titleTpl;
  const combos = resolveCombos(tpl);
  if (combos.length === 0) {
    return { combos: [], totalCombos: 0, withMatches: 0, withoutMatches: 0 };
  }

  const haystacks = await loadCatalogHaystacks(tpl.storeId);

  const limited = combos.slice(0, tpl.maxRows);
  const rows = limited.map(tokens => {
    const built = buildRowFromCombo(tpl, keywordTpl, tokens);
    const matchCount = countCatalogMatches(haystacks, tokens);
    return { ...built, matchCount, passes: matchCount >= minMatch };
  });

  return {
    combos: rows,
    totalCombos: combos.length,
    withMatches: rows.filter(r => r.passes).length,
    withoutMatches: rows.filter(r => !r.passes).length,
    truncated: combos.length > limited.length,
    catalogDriven: Array.isArray((tpl.tokenDictsJson || {})._pairs),
  };
}

export async function generateRows(templateId, opts = {}) {
  const tpl = await prisma.pSeoTemplate.findUnique({ where: { id: templateId } });
  if (!tpl) throw new Error("Template not found");

  const d = PATTERN_DEFAULTS[tpl.pattern];
  const keywordTpl = d?.keywordTpl || tpl.titleTpl;
  const combos = resolveCombos(tpl);

  if (combos.length === 0) {
    throw new Error("Niciun rând de generat. Dacă ai folosit auto-fill, verifică dacă SEO Engine + AI Tagging au fost rulate.");
  }

  const minMatch = opts.minMatch ?? 1;
  const skipKeywords = new Set((opts.skipKeywords || []).map(k => String(k).toLowerCase().trim()));
  const haystacks = await loadCatalogHaystacks(tpl.storeId);

  const limited = combos.slice(0, tpl.maxRows);
  let created = 0;
  let skipped = 0;
  let skippedNoMatch = 0;
  let skippedByUser = 0;
  let skippedYmyl = 0;

  for (const tokens of limited) {
    const built = buildRowFromCombo(tpl, keywordTpl, tokens);
    if (skipKeywords.has(built.targetKeyword)) { skippedByUser++; continue; }

    // YMYL per-row guard — catches cases where the template body looks
    // benign but a specific token combo lands on YMYL territory (e.g. a
    // generic "best {X} for {Y}" template where {Y} happens to be
    // "diabetics" or "depression").
    const probe = [built.targetKeyword, built.title, built.meta, ...Object.values(tokens)].join(" ");
    if (detectYmyl(probe).isYmyl) { skippedYmyl++; continue; }

    const matchCount = countCatalogMatches(haystacks, tokens);
    if (matchCount < minMatch) { skippedNoMatch++; continue; }

    try {
      await prisma.pSeoRow.create({
        data: {
          templateId: tpl.id,
          storeId: tpl.storeId,
          tokensJson: tokens,
          targetKeyword: built.targetKeyword,
          url: built.url,
          title: built.title,
          metaDescription: built.meta,
          h1: built.h1,
          productCount: matchCount,
          status: "DRAFT",
        },
      });
      created++;
    } catch (e) {
      if (e.code === "P2002") skipped++;
      else throw e;
    }
  }

  return { created, skipped, skippedNoMatch, skippedByUser, skippedYmyl, totalCombos: combos.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Enrichment: volume/KD from DfsCache + product matching
// ─────────────────────────────────────────────────────────────────────────────

async function getKeywordDataLive(keyword) {
  // Try cache first via dfs-cache.server.js. Cache is keyed on the normalized
  // form (lowercase, RO-stemmed), so we MUST normalize before lookup — otherwise
  // "Tigaie Fonta" misses a row stored under "tigaie fonta" and we waste a DFS
  // call. Previous code passed the raw keyword and only got coincidental hits.
  try {
    const { getCached, normalizeKeyword } = await import("./dfs-cache.server.js");
    const cached = await getCached(normalizeKeyword(keyword), "ro");
    if (cached) return cached;
  } catch {}
  // Fall through to live DFS call
  try {
    const { enrichKeywords, hasDfsConfig } = await import("./dataforseo.server.js");
    const { normalizeKeyword, setBulkCached } = await import("./dfs-cache.server.js");
    if (!hasDfsConfig()) return null;
    // enrichKeywords returns a Map<normalizedKeyword, data> — not an array.
    const map  = await enrichKeywords([keyword], "ro");
    const data = map.get(normalizeKeyword(keyword)) || null;
    if (data) {
      try { await setBulkCached([data], "ro"); } catch {}
    }
    return data;
  } catch (e) {
    console.error("[pSEO] DFS enrich err:", e.message);
    return null;
  }
}

async function matchProductsForTokens(storeId, tokens) {
  const terms = Object.values(tokens).map((v) => String(v).toLowerCase());
  const products = await prisma.seoProduct.findMany({
    where: { storeId, status: { not: "deleted" } },
    select: { id: true, productId: true, productTitle: true, aiTag: true },
    take: 200,
  }).catch(() => []);

  const matched = [];
  for (const p of products) {
    const hay = [p.productTitle || "", p.aiTag || ""].join(" ").toLowerCase();
    const allPresent = terms.every((t) => hay.includes(t));
    const anyPresent = terms.some((t) => hay.includes(t));
    if (allPresent || (anyPresent && matched.length < 24)) {
      matched.push({ id: p.productId || p.id, title: p.productTitle });
      if (matched.length >= 24) break;
    }
  }
  return matched;
}

export async function enrichRow(rowId) {
  const row = await prisma.pSeoRow.findUnique({ where: { id: rowId } });
  if (!row) throw new Error("Row not found");

  const kw = await getKeywordDataLive(row.targetKeyword);
  const products = await matchProductsForTokens(row.storeId, row.tokensJson || {});

  return prisma.pSeoRow.update({
    where: { id: rowId },
    data: {
      searchVolume: kw?.volume ?? kw?.search_volume ?? null,
      kd:           kw?.difficulty ?? kw?.keyword_difficulty ?? null,
      matchedProductIds: products.map((p) => p.id),
      productCount: products.length,
    },
  });
}

export async function enrichTemplate(templateId, limit = 100) {
  const rows = await prisma.pSeoRow.findMany({
    where: { templateId, searchVolume: null },
    take: limit,
    select: { id: true },
  });
  for (const r of rows) {
    await enrichRow(r.id).catch((e) => console.error("[pSEO] enrich err", r.id, e.message));
  }
  return { enriched: rows.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cannibalization check via GSC triage data
// ─────────────────────────────────────────────────────────────────────────────

export async function checkCannibalization(rowId) {
  const row = await prisma.pSeoRow.findUnique({ where: { id: rowId } });
  if (!row) return { flag: false };

  const conflicts = await prisma.gscTriageResult.findMany({
    where: {
      storeId: row.storeId,
      keyword: { contains: row.targetKeyword.split(" ").slice(0, 3).join(" "), mode: "insensitive" },
      position: { lte: 20 },
    },
    select: { keyword: true, position: true, clicks: true, impressions: true },
    take: 3,
  }).catch(() => []);

  const flag = conflicts.length > 0 && conflicts.some((c) => c.position <= 10);
  const notes = conflicts.length
    ? conflicts.map((c) => `"${c.keyword}" @${c.position.toFixed(1)} (${c.clicks}c/${c.impressions}i)`).join("; ")
    : null;

  await prisma.pSeoRow.update({
    where: { id: rowId },
    data: { cannibalFlag: flag, cannibalNotes: notes },
  });

  return { flag, conflicts };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI content generation (Anthropic)
// ─────────────────────────────────────────────────────────────────────────────

// Accepts either a plain string (legacy) or { system, user } (new). When
// `system` is provided, it ships as a system block with cache_control set
// to ephemeral — Anthropic caches the prefix for 5 minutes, so repeat
// calls with the same system text pay ~10% input cost on cache reads.
// At drip-publish scale (3 sections × N rows), this collapses input
// spend by 30-50% after the first row warms the cache.
async function callClaude(input, maxTokens = 800, temperature = 0.3) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI key not configured");
  const model = process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001";

  const isObj = typeof input === "object" && input && (input.system || input.user);
  const userContent = isObj ? input.user : input;
  const systemText  = isObj ? input.system : null;

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: "user", content: userContent }],
  };
  if (systemText) {
    body.system = [{
      type: "text",
      text: systemText,
      cache_control: { type: "ephemeral" },
    }];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`AI ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return data.content?.[0]?.text?.trim() || "";
  } finally {
    clearTimeout(timer);
  }
}

// Phrases the playbook lists as "AI tells" that signal templated content
// to readers and Google's quality classifiers. Banning them in prompts
// raises perceived authenticity.
const BANNED_FILLER = [
  "in today's fast-paced world",
  "level up", "take it to the next level",
  "în era digitală", "în lumea de astăzi", "lumea modernă",
  "este important să", "este esențial să",
  "așa cum am menționat",
  "fără îndoială", "în mod incontestabil",
];

// Real GSC queries grounded in this cluster — anchor the AI to user
// language merchants actually rank for, not invented phrasing.
async function fetchRowSignals(row) {
  const stem = row.targetKeyword.split(/\s+/).filter(w => w.length >= 4).slice(0, 2);
  const [gscQueries, kwResearch] = await Promise.all([
    stem.length ? prisma.gscTriageResult.findMany({
      where: {
        storeId: row.storeId,
        impressions: { gt: 0 },
        OR: stem.map(s => ({ keyword: { contains: s, mode: "insensitive" } })),
      },
      select: { keyword: true, impressions: true },
      orderBy: { impressions: "desc" },
      take: 5,
    }).catch(() => []) : [],
    stem.length ? prisma.seoKeyword.findMany({
      where: {
        storeId: row.storeId,
        volume: { gt: 0 },
        OR: stem.map(s => ({ keyword: { contains: s, mode: "insensitive" } })),
      },
      select: { keyword: true, volume: true },
      orderBy: { volume: "desc" },
      take: 5,
    }).catch(() => []) : [],
  ]);
  return { gscQueries, kwResearch };
}

// Princeton GEO paper (Aggarwal et al. 2024) found that AI engines
// (Perplexity, ChatGPT, Gemini) cite content with verifiable statistics
// +41% more often than control, and content with attributed quotations
// +40% more. This fn assembles a pool of REAL facts the AI must reference
// in its output — pulled exclusively from data we own or have validated
// (catalog, GSC, DataForSEO). The AI is then instructed to cite at least
// one of these verbatim, with the source name in parentheses.
async function fetchVerifiedFacts(row, matchedProducts) {
  const facts = [];

  // Catalog stats — product count + aiSub distribution
  const productCount = row.productCount || matchedProducts.length;
  if (productCount > 0) {
    facts.push(`${productCount} produse în catalog match-uite pe acest segment (sursa: inventar magazin)`);
  }

  // Top aiSub clusters within the matched products
  if ((row.matchedProductIds || []).length > 0) {
    const subAgg = await prisma.seoProduct.groupBy({
      by: ["aiSub"],
      where: {
        storeId: row.storeId,
        status: { not: "deleted" },
        aiSub: { not: null },
        OR: [
          { id: { in: row.matchedProductIds || [] } },
          { productId: { in: row.matchedProductIds || [] } },
        ],
      },
      _count: { _all: true },
      orderBy: { _count: { aiSub: "desc" } },
      take: 3,
    }).catch(() => []);
    const topSubs = subAgg.filter(s => s.aiSub && s._count._all >= 2);
    if (topSubs.length) {
      const distribution = topSubs.map(s => `${s.aiSub} (${s._count._all})`).join(", ");
      facts.push(`Distribuție subcategorii în catalog: ${distribution} (sursa: tag-uri AI catalog)`);
    }
  }

  // Real keyword volume for the row
  if (row.searchVolume && row.searchVolume > 0) {
    facts.push(`${row.searchVolume} căutări lunare estimat pe Google România pentru "${row.targetKeyword}" (sursa: DataForSEO)`);
  }

  // Real GSC impressions for related queries
  const gscTotal = await prisma.gscTriageResult.aggregate({
    where: {
      storeId: row.storeId,
      OR: row.targetKeyword.split(/\s+/).filter(w => w.length >= 4).slice(0, 2)
        .map(s => ({ keyword: { contains: s, mode: "insensitive" } })),
    },
    _sum: { impressions: true, clicks: true },
  }).catch(() => null);
  const totalImp = gscTotal?._sum?.impressions || 0;
  const totalClicks = gscTotal?._sum?.clicks || 0;
  if (totalImp > 50) {
    const ctr = totalClicks > 0 ? ((totalClicks / totalImp) * 100).toFixed(1) : null;
    facts.push(`${totalImp} impresii Google ultimele 90 zile pe query-uri din această categorie${ctr ? `, CTR ${ctr}%` : ""} (sursa: Google Search Console)`);
  }

  return facts;
}

// Cacheable system prompt — invariant across rows. Goes in Anthropic's
// system block with cache_control: ephemeral, so input cost drops to
// ~10% per call after the first one warms the cache.
const SYSTEM_INTRO = `ROL: Ești un recenzent senior de produse cu 10 ani experiență, scriind pentru un magazin online din România.

PUBLIC ȚINTĂ: Cumpărători români care caută produse pe Google și decid să cumpere în următoarele 24h.

═══════════ SARCINĂ ═══════════
Scrie un paragraf introductiv de 80-120 cuvinte.

STRUCTURĂ OBLIGATORIE:
1. PRIMA PROPOZIȚIE (max 25 cuvinte): răspuns DIRECT la keyword-ul țintă. NU "Atunci când cauți", NU "Bun venit", NU "Te-ai întrebat vreodată". Începe cu definiția/categoria sau cu o afirmație concretă.
2. PRIMELE 40-60 CUVINTE: conțin răspunsul complet la întrebarea implicită din keyword. Cititorul nu mai trebuie să citească restul ca să afle ce este produsul și pentru ce.
3. URMĂTOARELE 30-60 cuvinte: 2-3 criterii concrete. Dacă există fapte verificate în user message, integrează cel puțin 1 verbatim cu sursa în paranteze.

CONSTRÂNGERI:
- Limba: română cu diacritice corecte.
- NU folosi: ${BANNED_FILLER.slice(0, 6).map(p => `"${p}"`).join(", ")}.
- NU inventa cifre, statistici, prețuri sau procente.
- NU începe cu "Cele mai bune" sau cu titlul exact.
- Nivel de lectură: clasa 8.

INTEGRARE STATISTICĂ: când user message conține un block FAPTE VERIFICATE, regulă strictă — integrează cel puțin 1 cifră verbatim, exact cum e scrisă, cu sursa între paranteze. Exemplu acceptabil: "În catalogul nostru găsești 47 produse pentru această utilizare (inventar magazin)." Princeton GEO paper 2024 măsoară +41% citation rate AI cu statistici verificabile.

Returnează DOAR paragraful, fără titluri, markdown sau introduceri.`;

function buildIntroPrompt(row, matchedProducts, signals = {}, facts = []) {
  const productsStr = (matchedProducts || []).slice(0, 5).map(p => `- ${p.title}`).join("\n") || "(catalog gol)";
  const gscStr = (signals.gscQueries || []).map(g => `"${g.keyword}"`).join(", ") || "(fără date GSC)";
  const factsStr = facts.length ? facts.map((f, i) => `${i + 1}. ${f}`).join("\n") : "(fără statistici verificate)";

  const user = `DATE PENTRU ACEASTĂ PAGINĂ:
- Titlul paginii: "${row.title}"
- Keyword principal (de menționat natural cel puțin o dată): "${row.targetKeyword}"
- Produse reale din catalog (pentru context, NU le enumera): ${productsStr}
- Query-uri reale GSC: ${gscStr}

FAPTE VERIFICATE (folosește MINIM 1 dacă există):
${factsStr}

Scrie acum paragraful introductiv conform regulilor din system.`;

  return { system: SYSTEM_INTRO, user };
}

const SYSTEM_GUIDE = `ROL: Recenzent senior cu 10 ani experiență de testare produse, scriind pentru un magazin online din România.

SARCINA: Scrie secțiunea "Cum să alegi" pentru pagina indicată — 120-180 cuvinte cu 3 criterii specifice categoriei.

STRUCTURĂ (folosește exact 3 criterii):
- Criteriu 1: spune ce contează + cum decizi
- Criteriu 2: spune ce contează + cum decizi
- Criteriu 3: spune ce contează + cum decizi

INTEGRARE STATISTICĂ: când user message conține FAPTE VERIFICATE, regulă strictă — referă cel puțin 1 dintre fapte cu sursa între paranteze. Cifrele se citează verbatim, nu se reformulează.

CONSTRÂNGERI:
- Limba: română cu diacritice.
- NU inventa cifre, prețuri, dimensiuni concrete.
- NU folosi "este important să", "este esențial să", "așa cum am menționat", "în lumea modernă".
- Folosește limbajul real al clienților din keyword research furnizat.
- Ton: practic, direct, fără frazeologie.

Returnează DOAR textul secțiunii (fără titlu, fără markdown).`;

function buildGuidePrompt(row, matchedProducts, signals = {}, facts = []) {
  const productsStr = (matchedProducts || []).slice(0, 5).map(p => `- ${p.title}`).join("\n") || "(fără produse)";
  const kwStr = (signals.kwResearch || []).map(k => `"${k.keyword}" (${k.volume}/lună)`).join(", ") || "(fără keyword research)";
  const factsStr = facts.length ? facts.map((f, i) => `${i + 1}. ${f}`).join("\n") : "(fără statistici verificate)";

  const user = `DATE PENTRU ACEASTĂ PAGINĂ:
- Titlul paginii: "${row.title}"
- Categorie: "${row.title.toLowerCase()}"
- Produse reale (pentru context): ${productsStr}
- Variațiuni keyword cu volum real (ce caută clienții): ${kwStr}

FAPTE VERIFICATE (folosește MINIM 1 dacă există):
${factsStr}

Scrie acum secțiunea "Cum să alegi" conform regulilor din system.`;

  return { system: SYSTEM_GUIDE, user };
}

const SYSTEM_FAQ = `ROL: Editor SEO pentru magazin online din România.

SARCINA: Generează 4 FAQ pentru pagina indicată. Cel puțin 2 din 4 întrebări TREBUIE să răspundă la query-uri reale GSC din user message (rescriere naturală, nu copy-paste exact).

FORMAT (JSON valid, fără text înainte/după):
[
  { "q": "Întrebarea 1?", "a": "Răspuns 40-60 cuvinte." },
  { "q": "Întrebarea 2?", "a": "..." },
  { "q": "Întrebarea 3?", "a": "..." },
  { "q": "Întrebarea 4?", "a": "..." }
]

CONSTRÂNGERI:
- Răspuns: 40-60 cuvinte fiecare, practic, fără filler.
- NU inventa cifre sau prețuri specifice.
- Cel puțin 2 întrebări reflectă intent-ul din query-urile GSC.
- Limba: română cu diacritice.

Returnează DOAR JSON-ul.`;

function buildFaqPrompt(row, signals = {}) {
  const gscStr = (signals.gscQueries || []).slice(0, 8).map(g => `- "${g.keyword}" (${g.impressions} imp)`).join("\n") || "(fără date GSC)";

  const user = `DATE PENTRU ACEASTĂ PAGINĂ:
- Titlul paginii: "${row.title}"
- Keyword principal: "${row.targetKeyword}"

QUERY-URI REALE DIN GSC (sursa adevărului):
${gscStr}

Generează acum JSON-ul de FAQ conform formatului din system.`;

  return { system: SYSTEM_FAQ, user };
}

export async function generateContentForRow(rowId) {
  const row = await prisma.pSeoRow.findUnique({
    where: { id: rowId },
    include: { template: true },
  });
  if (!row) throw new Error("Row not found");

  const { enforceTrialLimit } = await import("../trial-limits.server.js");
  await enforceTrialLimit(row.storeId, "programmatic_content", 1);

  const matched = (row.matchedProductIds || []).map((id) => ({ id, title: id }));
  const products = await prisma.seoProduct.findMany({
    where: { storeId: row.storeId, status: { not: "deleted" }, OR: [{ id: { in: matched.map(m => m.id) } }, { productId: { in: matched.map(m => m.id) } }] },
    select: { productTitle: true },
    take: 5,
  }).catch(() => []);

  const productSummaries = products.map(p => ({ title: p.productTitle }));
  const signals = await fetchRowSignals(row);
  const facts = await fetchVerifiedFacts(row, productSummaries);
  const sections = [
    { key: "intro", prompt: buildIntroPrompt(row, productSummaries, signals, facts), max: 400 },
    { key: "guide", prompt: buildGuidePrompt(row, productSummaries, signals, facts), max: 600 },
    { key: "faq",   prompt: buildFaqPrompt(row, signals), max: 800 },
  ];

  const results = {};
  for (const s of sections) {
    try {
      const text = await callClaude(s.prompt, s.max);
      const promptHash = hashContent(s.prompt);
      const contentHash = hashContent(text);
      await prisma.pSeoContent.upsert({
        where: { rowId_sectionKey: { rowId: row.id, sectionKey: s.key } },
        update: {
          content: text,
          wordCount: wordCount(text),
          aiModel: process.env.AI_MODEL_FAST || "fast",
          promptHash,
          uniquenessHash: contentHash,
        },
        create: {
          rowId: row.id,
          sectionKey: s.key,
          content: text,
          wordCount: wordCount(text),
          aiModel: process.env.AI_MODEL_FAST || "fast",
          promptHash,
          uniquenessHash: contentHash,
        },
      });
      results[s.key] = { ok: true, words: wordCount(text) };
    } catch (e) {
      results[s.key] = { ok: false, error: e.message };
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quality gates
// ─────────────────────────────────────────────────────────────────────────────

// 5-word shingle Jaccard similarity. Word-shingles capture phrase-level
// duplication ("the best blue dress for summer parties" → 5 overlapping
// 5-grams), more meaningful than character n-grams for our case. Returns
// 0..1 where 1 = identical, 0 = fully disjoint.
function shingleSet(text, k = 5) {
  const tokens = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const set = new Set();
  if (tokens.length < k) {
    if (tokens.length > 0) set.add(tokens.join(" "));
    return set;
  }
  for (let i = 0; i <= tokens.length - k; i++) {
    set.add(tokens.slice(i, i + k).join(" "));
  }
  return set;
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const s of a) if (b.has(s)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

// Caps comparisons to the N most-recent APPROVED/PUBLISHED rows from the
// same store to keep this fast for large pSEO sets (1000+ rows).
const DOORWAY_COMPARE_LIMIT      = 100;
const DOORWAY_SIMILARITY_THRESHOLD = 0.7;

async function findDoorwayDuplicates(row) {
  const myText = (row.contents || []).map(c => c.content || "").join("\n");
  if (myText.trim().length < 100) return { maxSim: 0, dupOf: null };

  const mySet = shingleSet(myText);
  if (mySet.size === 0) return { maxSim: 0, dupOf: null };

  const peers = await prisma.pSeoRow.findMany({
    where: {
      storeId:  row.storeId,
      id:       { not: row.id },
      status:   { in: ["APPROVED", "SCHEDULED", "PUBLISHED"] },
    },
    select: { id: true, targetKeyword: true, contents: { select: { content: true } } },
    orderBy: { updatedAt: "desc" },
    take: DOORWAY_COMPARE_LIMIT,
  });

  let maxSim = 0;
  let dupOf  = null;
  for (const peer of peers) {
    const peerText = (peer.contents || []).map(c => c.content || "").join("\n");
    if (peerText.trim().length < 100) continue;
    const sim = jaccard(mySet, shingleSet(peerText));
    if (sim > maxSim) {
      maxSim = sim;
      dupOf  = { id: peer.id, targetKeyword: peer.targetKeyword };
    }
  }
  return { maxSim, dupOf };
}

export async function runQualityChecks(rowId) {
  const row = await prisma.pSeoRow.findUnique({
    where: { id: rowId },
    include: { template: true, contents: true },
  });
  if (!row) return null;

  const tpl = row.template;
  const totalWords = row.contents.reduce((n, c) => n + (c.wordCount || 0), 0);
  const issues = [];
  let score = 100;

  if (totalWords < 350) { issues.push(`Conținut prea scurt: ${totalWords} cuvinte (min 350)`); score -= 30; }
  if ((row.productCount || 0) < tpl.minProductCount) { issues.push(`Produse insuficiente: ${row.productCount}/${tpl.minProductCount}`); score -= 25; }
  if (row.cannibalFlag) { issues.push(`Conflict cu pagini existente în GSC`); score -= 20; }
  if ((row.searchVolume || 0) < tpl.minSearchVolume) { issues.push(`Volum căutare mic: ${row.searchVolume || 0}/lună`); score -= 10; }
  if ((row.kd || 0) > tpl.maxKd) { issues.push(`Dificultate prea mare: KD ${row.kd}`); score -= 10; }

  // Doorway-pages guard — Google spam policy (Search Central, §"Doorway
  // abuse"): "many near-duplicate pages funneling users to one destination."
  // If our generated content is too similar to other rows in the same store,
  // block approval. Threshold 0.7 = 70%+ phrase overlap, conservative.
  const { maxSim, dupOf } = await findDoorwayDuplicates(row);
  let doorwayBlock = false;
  if (maxSim >= DOORWAY_SIMILARITY_THRESHOLD) {
    issues.push(`Conținut prea similar (${(maxSim * 100).toFixed(0)}%) cu "${dupOf?.targetKeyword || "alt rând"}" — risc doorway`);
    score -= 40;
    doorwayBlock = true;
  } else if (maxSim >= 0.5) {
    issues.push(`Similaritate moderată (${(maxSim * 100).toFixed(0)}%) cu alt rând`);
    score -= 10;
  }

  // Answer-first enforcement — 44.2% of LLM citations come from the first
  // 30% of a page (Princeton GEO + Profound 2025). If the intro doesn't
  // contain the keyword stems in its first sentence + first 60 words,
  // citation rate drops by ~30%.
  const intro = row.contents.find(c => c.sectionKey === "intro")?.content || "";
  if (!intro) {
    issues.push("Intro lipsă"); score -= 5;
  } else {
    const introNorm = normText(intro);
    const firstSentence = introNorm.split(/[.!?]\s/)[0] || "";
    const first60 = introNorm.split(/\s+/).slice(0, 60).join(" ");
    const stems = tokenStems(row.targetKeyword);
    if (stems.length > 0) {
      const stemInFirst60 = stems.some(s => first60.includes(s));
      const stemInFirstSentence = stems.some(s => firstSentence.includes(s));
      if (!stemInFirst60) { issues.push(`Răspuns direct lipsă în primele 60 cuv (lipsesc stem-uri "${stems.join(', ')}")`); score -= 15; }
      else if (!stemInFirstSentence) { issues.push("Stem-ul keyword apare târziu în intro (nu în prima propoziție)"); score -= 5; }
    }
  }

  // Statistics presence — Princeton GEO: +41% citation rate with verifiable
  // stats. We reward presence of any percentage / number-with-unit / source
  // citation pattern. Soft bonus, not penalty.
  const allText = row.contents.map(c => c.content || "").join(" ");
  const hasPercentage = /\b\d+[\s.,]?\d*\s?%/.test(allText);
  const hasNumberUnit = /\b\d+\s+(produse|recenzii|clienți|căutări|impresii|comenzi|cuvinte|zile|luni|ani)/i.test(allText);
  const hasSourceAttribution = /\((sursa|sursă|inventar|catalog|conform|GSC|Google Search Console|DataForSEO)/i.test(allText);
  if ((hasPercentage || hasNumberUnit) && hasSourceAttribution) {
    score += 5; // ceiling at 100 below
  } else if (hasPercentage || hasNumberUnit) {
    score += 2;
  }

  const finalScore = Math.max(0, Math.min(100, score));
  const shouldApprove = finalScore >= 70 && totalWords >= 350 && !row.cannibalFlag && !doorwayBlock;

  await prisma.pSeoRow.update({
    where: { id: rowId },
    data: {
      qualityScore: finalScore,
      qualityIssues: issues.join("; ") || null,
      status: shouldApprove ? "APPROVED" : row.status,
    },
  });

  return { score: finalScore, issues, approved: shouldApprove };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shopify publishing (Metaobject or Page)
// ─────────────────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escJsonLd(s) {
  // JSON.stringify handles escaping correctly when interpolated as a value.
  return JSON.stringify(String(s || ""));
}

// Generated pages must signal value to Google and AI engines via structured
// data, must NOT be orphaned (related-pages block), and must establish
// hierarchy (visible breadcrumb + BreadcrumbList schema). Without these,
// pSEO pages are treated as doorway content by 2024+ Google policy.
function buildHtmlBody(row, contents, products, opts = {}) {
  const { shopUrl = "", relatedGuides = [], hubLabel = "Ghiduri" } = opts;
  const map = Object.fromEntries(contents.map((c) => [c.sectionKey, c.content]));

  const productItems = (products || []).slice(0, 12).map(p => ({
    title: p.title,
    handle: p.handle || slugify(p.title),
    url: `${shopUrl}/products/${p.handle || slugify(p.title)}`,
  }));

  const productGridHtml = productItems
    .map(p => `<li><a href="/products/${escHtml(p.handle)}">${escHtml(p.title)}</a></li>`)
    .join("\n");

  let faqHtml = "";
  let faqs = [];
  try {
    const parsed = JSON.parse(map.faq || "[]");
    if (Array.isArray(parsed)) faqs = parsed.filter(f => f && f.q && f.a);
  } catch {}
  if (faqs.length) {
    faqHtml = `<section><h2>Întrebări frecvente</h2>\n<dl>\n` +
      faqs.map(f => `<dt>${escHtml(f.q)}</dt>\n<dd>${escHtml(f.a)}</dd>`).join("\n") +
      `\n</dl></section>`;
  }

  const breadcrumbHtml = `<nav aria-label="Breadcrumb" class="pseo-breadcrumb">
<ol style="display:flex;flex-wrap:wrap;gap:6px;list-style:none;padding:0;margin:0 0 16px;font-size:13px;color:#6B7280">
<li><a href="/">Home</a> ›</li>
<li><a href="/pages/pseo-sitemap">${escHtml(hubLabel)}</a> ›</li>
<li aria-current="page">${escHtml(row.title)}</li>
</ol>
</nav>`;

  const relatedHtml = relatedGuides.length ? `<section class="pseo-related" style="margin-top:32px;padding-top:24px;border-top:1px solid #E5E7EB">
<h2>Ghiduri similare</h2>
<ul style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;list-style:none;padding:0">
${relatedGuides.slice(0, 6).map(g => `<li><a href="${escHtml(g.url)}" rel="related">${escHtml(g.title)}</a></li>`).join("\n")}
</ul>
</section>` : "";

  const pageUrl = `${shopUrl}${row.url}`;
  const isoDate = new Date().toISOString();
  const orgId = shopUrl ? `${shopUrl}#organization` : undefined;

  // Consolidated @graph with @id linking. Google + AI parsers (Perplexity,
  // ChatGPT) prefer a single JSON-LD block where entities cross-reference
  // via @id over multiple disjoint blocks. We also reference the storefront
  // Organization (set via api.org-schema.js) by @id so the brand isn't
  // duplicated per page.
  const graphNodes = [];

  graphNodes.push({
    "@type": "Article",
    "@id": `${pageUrl}#article`,
    "headline": row.title,
    "description": row.metaDescription,
    "url": pageUrl,
    "datePublished": row.publishedAt ? new Date(row.publishedAt).toISOString() : isoDate,
    "dateModified": isoDate,
    "author": orgId ? { "@id": orgId } : { "@type": "Organization", "name": "Magazin" },
    "publisher": orgId ? { "@id": orgId } : undefined,
    "mainEntityOfPage": { "@type": "WebPage", "@id": pageUrl },
  });

  if (productItems.length) {
    graphNodes.push({
      "@type": "ItemList",
      "@id": `${pageUrl}#itemlist`,
      "name": row.title,
      "numberOfItems": productItems.length,
      "itemListElement": productItems.map((p, i) => ({
        "@type": "ListItem",
        "position": i + 1,
        "url": p.url,
        "name": p.title,
      })),
    });
  }

  graphNodes.push({
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumb`,
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": shopUrl || "/" },
      { "@type": "ListItem", "position": 2, "name": hubLabel, "item": `${shopUrl}/pages/pseo-sitemap` },
      { "@type": "ListItem", "position": 3, "name": row.title },
    ],
  });

  if (faqs.length) {
    graphNodes.push({
      "@type": "FAQPage",
      "@id": `${pageUrl}#faq`,
      "mainEntity": faqs.map(f => ({
        "@type": "Question",
        "name": f.q,
        "acceptedAnswer": { "@type": "Answer", "text": f.a },
      })),
    });
  }

  const graph = {
    "@context": "https://schema.org",
    "@graph": graphNodes,
  };

  const jsonLdBlocks = `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;

  // Pick a structural variant deterministically by row id. Four layouts
  // rotate the section order and H2 wording — same row always gets the
  // same variant (so re-publishing doesn't shuffle content), but across
  // a 500-page batch you get a roughly 25/25/25/25 distribution. Anti-
  // doorway signal: doorway pages share identical HTML skeleton.
  const variantIndex = parseInt(hashContent(row.id || row.targetKeyword).slice(0, 4), 16) % 4;
  const intro = map.intro || "";
  const guide = map.guide || "";
  const productsSection = `<h2>${PRODUCTS_HEADING[variantIndex]}</h2>
<ul>
${productGridHtml}
</ul>`;
  const guideSection = guide ? `<h2>${GUIDE_HEADING[variantIndex]}</h2>
<p>${guide}</p>` : "";

  let bodyHtml;
  switch (variantIndex) {
    case 0: // Classic: intro → products → guide → FAQ
      bodyHtml = `<p>${intro}</p>\n${productsSection}\n${guideSection}\n${faqHtml}`;
      break;
    case 1: // Criteria-first: intro → guide → products → FAQ
      bodyHtml = `<p>${intro}</p>\n${guideSection}\n${productsSection}\n${faqHtml}`;
      break;
    case 2: // FAQ-led: intro → products → FAQ → guide
      bodyHtml = `<p>${intro}</p>\n${productsSection}\n${faqHtml}\n${guideSection}`;
      break;
    case 3: // Guide-only opener: guide as intro → products → FAQ
      bodyHtml = `<p>${intro}</p>\n${guideSection}\n${productsSection}\n${faqHtml}`;
      break;
    default:
      bodyHtml = `<p>${intro}</p>\n${productsSection}\n${guideSection}\n${faqHtml}`;
  }

  return `${breadcrumbHtml}
<article>
${bodyHtml}
</article>
${relatedHtml}
${jsonLdBlocks}`;
}

// H2 wording rotates across variants so the same page template doesn't
// produce identically-structured HTML across thousands of generated pages.
const PRODUCTS_HEADING = [
  "Produse recomandate",
  "Selecția noastră",
  "Top picks din catalog",
  "Ce avem în stoc",
];
const GUIDE_HEADING = [
  "Cum să alegi",
  "Pe ce să te uiți la achiziție",
  "Criterii de selecție",
  "Ce contează când alegi",
];

async function shopifyGraphQL(shopDomain, accessToken, query, variables = {}) {
  // Delegate to the central helper so we get 429/5xx retry + Retry-After respect.
  // The pSEO publish path benefits the most from this — bulk drip publishes
  // hit Shopify in tight loops.
  const { shopifyGraphQL: gql } = await import("./shopify-graphql.server.js");
  const body = await gql({ accessToken, shopDomain, query, variables });
  return body.data;
}

async function publishAsPage(shopDomain, accessToken, row, contents, products, opts = {}) {
  const html = buildHtmlBody(row, contents, products, opts);
  const mutation = `
    mutation pageCreate($page: PageCreateInput!) {
      pageCreate(page: $page) {
        page { id handle }
        userErrors { field message }
      }
    }`;
  const handle = row.url.replace(/^\/pages\//, "");
  const variables = {
    page: {
      title: row.title,
      handle,
      body: html,
      isPublished: true,
      templateSuffix: null,
    },
  };
  const data = await shopifyGraphQL(shopDomain, accessToken, mutation, variables);
  const result = data?.pageCreate;
  if (result?.userErrors?.length) throw new Error(result.userErrors[0].message);
  return { resourceId: result?.page?.id, resourceType: "page" };
}

export async function publishRow(rowId, ctx = {}) {
  const row = await prisma.pSeoRow.findUnique({
    where: { id: rowId },
    include: { template: true, contents: true },
  });
  if (!row) throw new Error("Row not found");
  if (row.status === "PUBLISHED") return { alreadyPublished: true, resourceId: row.shopifyResourceId };

  const { enforceTrialLimit } = await import("../trial-limits.server.js");
  await enforceTrialLimit(row.storeId, "programmatic_publish", 1);

  let { accessToken, shopDomain } = ctx;
  if (!shopDomain) {
    const store = await prisma.store.findUnique({ where: { id: row.storeId }, select: { shopDomain: true } });
    shopDomain = store?.shopDomain;
  }

  if (!shopDomain || !accessToken) {
    await prisma.pSeoRow.update({
      where: { id: rowId },
      data: { status: "FAILED", qualityIssues: (row.qualityIssues || "") + "; Missing Shopify auth context" },
    });
    throw new Error("Shopify auth context missing. Open the page from the Shopify admin so the session token is available.");
  }

  const matchedIds = row.matchedProductIds || [];
  const products = await prisma.seoProduct.findMany({
    where: { storeId: row.storeId, status: { not: "deleted" }, OR: [
      { id:        { in: matchedIds } },
      { productId: { in: matchedIds } },
    ] },
    select: { productTitle: true, productId: true },
    take: 12,
  }).catch(() => []);
  const productSummaries = products.map(p => ({ title: p.productTitle, handle: slugify(p.productTitle) }));

  // Sibling guides: other PUBLISHED rows from the same template. We surface 6
  // of them at the bottom so each generated page links to its cluster
  // (hub-and-spoke), preventing the orphan-page anti-pattern that triggers
  // Google's doorway-content classifier.
  const siblings = await prisma.pSeoRow.findMany({
    where: { templateId: row.templateId, status: "PUBLISHED", id: { not: rowId } },
    select: { title: true, url: true },
    orderBy: { qualityScore: "desc" },
    take: 10,
  }).catch(() => []);

  const shopUrl = `https://${shopDomain}`;
  const buildOpts = {
    shopUrl,
    relatedGuides: siblings.map(s => ({ title: s.title, url: s.url })),
    hubLabel: "Ghiduri",
  };

  try {
    const { resourceId, resourceType } = await publishAsPage(shopDomain, accessToken, row, row.contents, productSummaries, buildOpts);
    await prisma.pSeoRow.update({
      where: { id: rowId },
      data: {
        status: "PUBLISHED",
        shopifyResourceId: resourceId,
        shopifyResourceType: resourceType,
        publishedAt: new Date(),
      },
    });
    return { resourceId, resourceType };
  } catch (e) {
    await prisma.pSeoRow.update({
      where: { id: rowId },
      data: { status: "FAILED", qualityIssues: (row.qualityIssues || "") + "; Publish error: " + e.message },
    });
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML sitemap index — every published pSEO page must be discoverable from a
// navigational element (Google explicitly warns against orphan pSEO). We
// regenerate /pages/pseo-sitemap after every batch so Googlebot finds new
// pages quickly and link equity flows between cluster siblings.
// ─────────────────────────────────────────────────────────────────────────────

async function findShopifyPageByHandle(shopDomain, accessToken, handle) {
  const query = `
    query findPage($handle: String!) {
      pages(first: 1, query: $handle) {
        edges { node { id handle } }
      }
    }`;
  try {
    const data = await shopifyGraphQL(shopDomain, accessToken, query, { handle: `handle:${handle}` });
    return data?.pages?.edges?.[0]?.node || null;
  } catch {
    return null;
  }
}

export async function regeneratePseoSitemap(storeId, ctx = {}) {
  let { accessToken, shopDomain } = ctx;
  if (!shopDomain) {
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true } });
    shopDomain = store?.shopDomain;
  }
  if (!shopDomain || !accessToken) throw new Error("Shopify auth context missing");

  // Group all published rows by template
  const rows = await prisma.pSeoRow.findMany({
    where: { storeId, status: "PUBLISHED" },
    select: { title: true, url: true, template: { select: { name: true, pattern: true } } },
    orderBy: [{ template: { name: "asc" } }, { qualityScore: "desc" }],
    take: 5000,
  });

  if (rows.length === 0) return { skipped: true, reason: "no published rows yet" };

  const byTemplate = new Map();
  for (const r of rows) {
    const k = r.template?.name || "Ghiduri";
    if (!byTemplate.has(k)) byTemplate.set(k, []);
    byTemplate.get(k).push(r);
  }

  const sections = [];
  for (const [tplName, list] of byTemplate) {
    sections.push(`<section>
<h2>${escHtml(tplName)} <span style="color:#6B7280;font-weight:400;font-size:14px">(${list.length})</span></h2>
<ul style="columns:2;column-gap:24px;list-style:none;padding:0">
${list.map(r => `<li style="break-inside:avoid;margin-bottom:6px"><a href="${escHtml(r.url)}">${escHtml(r.title)}</a></li>`).join("\n")}
</ul>
</section>`);
  }

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": `https://${shopDomain}` },
      { "@type": "ListItem", "position": 2, "name": "Ghiduri" },
    ],
  };

  const body = `<nav aria-label="Breadcrumb" style="font-size:13px;color:#6B7280;margin-bottom:16px"><a href="/">Home</a> › Ghiduri</nav>
<h1>Ghiduri</h1>
<p>Index complet al ghidurilor noastre — ${rows.length} pagini organizate pe categorii.</p>
${sections.join("\n")}
<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>`;

  const handle = "pseo-sitemap";
  const existing = await findShopifyPageByHandle(shopDomain, accessToken, handle);

  if (existing) {
    const mutation = `
      mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page { id handle }
          userErrors { field message }
        }
      }`;
    const data = await shopifyGraphQL(shopDomain, accessToken, mutation, {
      id: existing.id,
      page: { title: "Ghiduri", body, isPublished: true },
    });
    if (data?.pageUpdate?.userErrors?.length) throw new Error(data.pageUpdate.userErrors[0].message);
    return { updated: true, pageCount: rows.length };
  } else {
    const mutation = `
      mutation pageCreate($page: PageCreateInput!) {
        pageCreate(page: $page) {
          page { id handle }
          userErrors { field message }
        }
      }`;
    const data = await shopifyGraphQL(shopDomain, accessToken, mutation, {
      page: { title: "Ghiduri", handle, body, isPublished: true },
    });
    if (data?.pageCreate?.userErrors?.length) throw new Error(data.pageCreate.userErrors[0].message);
    return { created: true, pageCount: rows.length };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Drip-publish — Google explicitly recommends ~50 pages/day for large
// programmatic rollouts (the alternative trips spam filters and shows
// up as a sudden site-quality cliff). Rows get a scheduledFor time
// spread across days; a cron picks them up respecting a daily cap.
// ─────────────────────────────────────────────────────────────────────────────

const DRIP_RATE_PER_DAY = 50;
const DRIP_INTERVAL_MS = Math.floor((24 * 60 * 60 * 1000) / DRIP_RATE_PER_DAY);

export async function scheduleDripBatch(templateId, totalToPublish = 200, opts = {}) {
  const tpl = await prisma.pSeoTemplate.findUnique({ where: { id: templateId } });
  if (!tpl) throw new Error("Template not found");

  const ratePerDay = opts.ratePerDay || DRIP_RATE_PER_DAY;
  const intervalMs = Math.floor((24 * 60 * 60 * 1000) / ratePerDay);

  // Get APPROVED rows ordered by quality (best first) — drip the strongest
  // pages first so the early indexation signal is strong.
  const rows = await prisma.pSeoRow.findMany({
    where: { templateId, status: "APPROVED" },
    select: { id: true },
    orderBy: { qualityScore: "desc" },
    take: totalToPublish,
  });

  if (rows.length === 0) return { scheduled: 0, message: "No APPROVED rows to schedule." };

  // Find current end-of-queue: latest scheduledFor across this store so we
  // pick up where prior drips left off instead of double-booking slots.
  const tail = await prisma.pSeoRow.findFirst({
    where: { storeId: tpl.storeId, status: "SCHEDULED" },
    orderBy: { scheduledFor: "desc" },
    select: { scheduledFor: true },
  });
  let cursor = tail?.scheduledFor ? new Date(tail.scheduledFor.getTime() + intervalMs) : new Date();

  let scheduled = 0;
  for (const r of rows) {
    await prisma.pSeoRow.update({
      where: { id: r.id },
      data: { status: "SCHEDULED", scheduledFor: cursor },
    });
    cursor = new Date(cursor.getTime() + intervalMs);
    scheduled++;
  }

  return {
    scheduled,
    firstAt: rows.length ? new Date(Date.now()).toISOString() : null,
    lastAt: cursor.toISOString(),
    ratePerDay,
  };
}

// Picks SCHEDULED rows whose scheduledFor has elapsed and publishes them
// using the store's offline access token. Per-store daily cap is enforced
// by counting how many rows have been PUBLISHED today (publishedAt >=
// startOfToday in store-local-ish UTC) — protects against bursts when the
// cron fires after a long downtime.
export async function runDripCron({ maxPerStore = DRIP_RATE_PER_DAY } = {}) {
  const now = new Date();
  const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Group: distinct storeIds with SCHEDULED rows due
  const dueRows = await prisma.pSeoRow.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: now } },
    select: { id: true, storeId: true },
    orderBy: { scheduledFor: "asc" },
    take: 500,
  });

  if (dueRows.length === 0) return { published: 0, message: "No due rows." };

  const byStore = new Map();
  for (const r of dueRows) {
    if (!byStore.has(r.storeId)) byStore.set(r.storeId, []);
    byStore.get(r.storeId).push(r.id);
  }

  let totalPublished = 0;
  const errors = [];

  for (const [storeId, rowIds] of byStore) {
    // Daily cap: how many already published in last 24h for this store
    const publishedRecently = await prisma.pSeoRow.count({
      where: { storeId, status: "PUBLISHED", publishedAt: { gte: dayStart } },
    });
    const remaining = Math.max(0, maxPerStore - publishedRecently);
    if (remaining === 0) continue;

    // Load offline session for this store to get access token
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true } });
    if (!store) continue;
    const session = await prisma.session.findFirst({
      where: { shop: store.shopDomain, isOnline: false },
      orderBy: { expires: "desc" },
    }).catch(() => null);
    if (!session?.accessToken) {
      errors.push(`${store.shopDomain}: no offline session`);
      continue;
    }
    const ctx = { accessToken: session.accessToken, shopDomain: store.shopDomain };

    for (const rowId of rowIds.slice(0, remaining)) {
      try {
        await publishRow(rowId, ctx);
        totalPublished++;
      } catch (e) {
        errors.push(`${rowId}: ${e.message}`);
      }
    }

    // After a store batch finishes, regenerate its sitemap once.
    try { await regeneratePseoSitemap(storeId, ctx); } catch {}
  }

  return { published: totalPublished, stores: byStore.size, errors: errors.slice(0, 10) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh automation — Google's freshness signal rewards updated content.
// The playbook recommends refreshing the lowest 20% of pages every 30-60
// days. We regenerate AI content for the oldest-untouched 5% per run,
// update the Shopify page body so dateModified bumps, and reset
// lastRefreshedAt. The cron runs on a slow cadence (~daily).
// ─────────────────────────────────────────────────────────────────────────────

export async function runRefreshCron({ maxPerStore = 5, ageDays = 30 } = {}) {
  const cutoff = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  const stores = await prisma.store.findMany({ select: { id: true, shopDomain: true } });

  let totalRefreshed = 0;
  const errors = [];

  for (const store of stores) {
    // Pick oldest PUBLISHED rows that haven't been refreshed recently
    const candidates = await prisma.pSeoRow.findMany({
      where: {
        storeId: store.id,
        status: "PUBLISHED",
        OR: [
          { lastRefreshedAt: null, publishedAt: { lt: cutoff } },
          { lastRefreshedAt: { lt: cutoff } },
        ],
      },
      orderBy: [{ lastRefreshedAt: { sort: "asc", nulls: "first" } }, { publishedAt: "asc" }],
      take: maxPerStore,
      select: { id: true },
    }).catch(() => []);

    if (candidates.length === 0) continue;

    const session = await prisma.session.findFirst({
      where: { shop: store.shopDomain, isOnline: false },
      orderBy: { expires: "desc" },
    }).catch(() => null);
    if (!session?.accessToken) {
      errors.push(`${store.shopDomain}: no offline session`);
      continue;
    }
    const ctx = { accessToken: session.accessToken, shopDomain: store.shopDomain };

    for (const c of candidates) {
      try {
        await refreshRow(c.id, ctx);
        totalRefreshed++;
      } catch (e) {
        errors.push(`${c.id}: ${e.message}`);
      }
    }
  }

  return { refreshed: totalRefreshed, errors: errors.slice(0, 10) };
}

// Regenerate AI content for one row and re-update the Shopify page so the
// dateModified ticks for Google. Lighter than a full publish — we keep
// product matches, keep the row id, just re-run content + push HTML.
// Build a stable hash of the demand + product signals that drive content.
// If this hash is unchanged from the last refresh, regenerating AI is a
// waste — output differs only due to temperature jitter, and pushing a
// new body to Shopify triggers a "fake freshness" signal Google now
// detects and penalizes (Mueller, SEO Office Hours Nov 2024).
function buildSignalsHash(row, signals) {
  const payload = {
    kw: row.targetKeyword,
    productCount: row.productCount || 0,
    matched: (row.matchedProductIds || []).slice().sort().join(","),
    searchVolume: row.searchVolume || 0,
    kd: row.kd || 0,
    gsc: (signals.gscQueries || [])
      .slice().sort((a, b) => a.keyword.localeCompare(b.keyword))
      .map(g => `${g.keyword}:${g.impressions}`),
    kwRes: (signals.kwResearch || [])
      .slice().sort((a, b) => a.keyword.localeCompare(b.keyword))
      .map(k => `${k.keyword}:${k.volume}`),
  };
  return hashContent(JSON.stringify(payload));
}

async function refreshRow(rowId, ctx) {
  const row = await prisma.pSeoRow.findUnique({
    where: { id: rowId },
    include: { template: true, contents: true },
  });
  if (!row) throw new Error("Row not found");
  if (row.status !== "PUBLISHED") return { skipped: true, reason: "not published" };
  if (!row.shopifyResourceId) return { skipped: true, reason: "no Shopify resource id" };

  const matched = (row.matchedProductIds || []);
  const products = await prisma.seoProduct.findMany({
    where: { storeId: row.storeId, status: { not: "deleted" },
      OR: [{ id: { in: matched } }, { productId: { in: matched } }] },
    select: { productTitle: true },
    take: 5,
  }).catch(() => []);
  const productSummaries = products.map(p => ({ title: p.productTitle }));
  const signals = await fetchRowSignals(row);
  const newHash = buildSignalsHash(row, signals);

  // Diff check: if signals are byte-identical to last refresh, skip AI AND
  // skip the Shopify pageUpdate below. We only stamp lastRefreshedAt so the
  // cron knows we visited this row. Critically, we do NOT push a fresh body
  // to Shopify — that would bump the article's dateModified without an actual
  // content change, which Google's "fake freshness" filter (Mueller, Nov 2024)
  // demotes as a stable-content abuse pattern.
  if (newHash === row.lastSignalsHash) {
    await prisma.pSeoRow.update({
      where: { id: rowId },
      data: { lastRefreshedAt: new Date() },
    });
    return { refreshed: true, mode: "no-change", reason: "signals identical" };
  }

  // Signals changed — full AI regeneration.
  const facts = await fetchVerifiedFacts(row, productSummaries);
  const sections = [
    { key: "intro", prompt: buildIntroPrompt(row, productSummaries, signals, facts), max: 400 },
    { key: "guide", prompt: buildGuidePrompt(row, productSummaries, signals, facts), max: 600 },
    { key: "faq",   prompt: buildFaqPrompt(row, signals), max: 800 },
  ];

  for (const s of sections) {
    try {
      const text = await callClaude(s.prompt, s.max);
      await prisma.pSeoContent.upsert({
        where: { rowId_sectionKey: { rowId: row.id, sectionKey: s.key } },
        update: { content: text, wordCount: wordCount(text), promptHash: hashContent(s.prompt), uniquenessHash: hashContent(text) },
        create: { rowId: row.id, sectionKey: s.key, content: text, wordCount: wordCount(text), aiModel: process.env.AI_MODEL_FAST || "fast", promptHash: hashContent(s.prompt), uniquenessHash: hashContent(text) },
      });
    } catch (e) {
      console.error("[pSEO refresh] AI section", s.key, e.message);
    }
  }

  const freshContents = await prisma.pSeoContent.findMany({ where: { rowId: row.id } });
  const siblings = await prisma.pSeoRow.findMany({
    where: { templateId: row.templateId, status: "PUBLISHED", id: { not: rowId } },
    select: { title: true, url: true },
    orderBy: { qualityScore: "desc" },
    take: 10,
  }).catch(() => []);
  const buildOpts = {
    shopUrl: `https://${ctx.shopDomain}`,
    relatedGuides: siblings.map(s => ({ title: s.title, url: s.url })),
  };
  const html = buildHtmlBody(row, freshContents, productSummaries, buildOpts);

  const mutation = `
    mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id handle }
        userErrors { field message }
      }
    }`;
  const data = await shopifyGraphQL(ctx.shopDomain, ctx.accessToken, mutation, {
    id: row.shopifyResourceId,
    page: { body: html },
  });
  if (data?.pageUpdate?.userErrors?.length) throw new Error(data.pageUpdate.userErrors[0].message);

  await prisma.pSeoRow.update({
    where: { id: rowId },
    data: { lastRefreshedAt: new Date(), lastSignalsHash: newHash },
  });

  return { refreshed: true, mode: "ai-regenerated" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch publish
// ─────────────────────────────────────────────────────────────────────────────

export async function createBatch(templateId, size = 50) {
  const tpl = await prisma.pSeoTemplate.findUnique({ where: { id: templateId } });
  if (!tpl) throw new Error("Template not found");
  return prisma.pSeoPublishBatch.create({
    data: { storeId: tpl.storeId, templateId: tpl.id, size, status: "queued" },
  });
}

export async function runBatch(batchId, ctx = {}) {
  const batch = await prisma.pSeoPublishBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error("Batch not found");

  await prisma.pSeoPublishBatch.update({
    where: { id: batchId },
    data: { status: "running", startedAt: new Date() },
  });

  const rows = await prisma.pSeoRow.findMany({
    where: { templateId: batch.templateId, status: "APPROVED" },
    take: batch.size,
    orderBy: { qualityScore: "desc" },
  });

  let ok = 0, fail = 0, skipped = 0;
  const errors = [];

  for (const row of rows) {
    try {
      await publishRow(row.id, ctx);
      ok++;
    } catch (e) {
      fail++;
      errors.push(`${row.targetKeyword}: ${e.message}`);
    }
  }

  const skippedRows = (await prisma.pSeoRow.count({
    where: { templateId: batch.templateId, status: "SKIPPED" },
  })) || 0;
  skipped = skippedRows;

  await prisma.pSeoPublishBatch.update({
    where: { id: batchId },
    data: {
      status: fail > 0 && ok === 0 ? "failed" : "done",
      finishedAt: new Date(),
      okCount: ok,
      failCount: fail,
      skippedCount: skipped,
      errorLog: errors.slice(0, 20).join("\n") || null,
    },
  });

  // Refresh the HTML sitemap index so the newly published pages aren't
  // orphan-pages waiting for the next Googlebot crawl of /sitemap.xml.
  // Best-effort: a failure here shouldn't fail the batch.
  if (ok > 0) {
    try { await regeneratePseoSitemap(batch.storeId, ctx); }
    catch (e) { console.error("[pSEO] sitemap regen failed:", e.message); }
  }

  return { ok, fail, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Listing for UI
// ─────────────────────────────────────────────────────────────────────────────

export async function listRows(templateId, { status, limit = 200 } = {}) {
  return prisma.pSeoRow.findMany({
    where: { templateId, ...(status ? { status } : {}) },
    orderBy: [{ cannibalFlag: "asc" }, { qualityScore: "desc" }, { searchVolume: "desc" }],
    take: limit,
    include: { contents: { select: { sectionKey: true, wordCount: true } } },
  });
}

export async function statsForTemplate(templateId) {
  const [total, draft, approved, published, failed, skipped] = await Promise.all([
    prisma.pSeoRow.count({ where: { templateId } }),
    prisma.pSeoRow.count({ where: { templateId, status: "DRAFT" } }),
    prisma.pSeoRow.count({ where: { templateId, status: "APPROVED" } }),
    prisma.pSeoRow.count({ where: { templateId, status: "PUBLISHED" } }),
    prisma.pSeoRow.count({ where: { templateId, status: "FAILED" } }),
    prisma.pSeoRow.count({ where: { templateId, status: "SKIPPED" } }),
  ]);
  return { total, draft, approved, published, failed, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog clustering — read the whole catalog, group by aiTag, attach all
// real demand signals per cluster (keywords, GSC queries, sub-tags). This
// is the foundation for catalog-driven pair generation (vs the old global
// cartesian which produced absurd combos at scale).
// ─────────────────────────────────────────────────────────────────────────────

// Group products by aiTag with per-cluster product counts and sample titles.
// Filters to clusters with ≥ minProductCount products. Returns at most
// maxClusters entries, ordered by product count desc.
async function clusterByAiTag(storeId, { minProductCount = 3, maxClusters = 60 } = {}) {
  // Use raw aggregation: groupBy with sample titles via separate query because
  // Prisma doesn't expose ARRAY_AGG cleanly without raw SQL.
  const groups = await prisma.seoProduct.groupBy({
    by: ["aiTag"],
    where: { storeId, status: { not: "deleted" }, aiTag: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { aiTag: "desc" } },
    take: maxClusters * 2, // over-fetch so we can filter < minProductCount
  });

  const qualified = groups.filter(g => g._count._all >= minProductCount).slice(0, maxClusters);

  // Per-cluster: 8 sample titles + distinct aiSubs
  const enriched = await Promise.all(qualified.map(async (g) => {
    const products = await prisma.seoProduct.findMany({
      where: { storeId, status: { not: "deleted" }, aiTag: g.aiTag },
      select: { productTitle: true, aiSub: true },
      take: 10,
    });
    const titles = products.map(p => p.productTitle).filter(Boolean);
    const aiSubs = [...new Set(products.map(p => p.aiSub).filter(Boolean))].slice(0, 8);
    return {
      aiTag: g.aiTag,
      productCount: g._count._all,
      sampleTitles: titles,
      aiSubs,
    };
  }));

  return enriched;
}

// Attach per-cluster keyword research + GSC signals. Done with a single
// IN-query per source then bucketed in memory.
async function attachDemandSignals(storeId, clusters) {
  const tags = clusters.map(c => c.aiTag);
  if (tags.length === 0) return clusters;

  const [keywords, gscRows] = await Promise.all([
    prisma.seoKeyword.findMany({
      where: { storeId, parentTag: { in: tags }, volume: { gt: 0 } },
      select: { keyword: true, parentTag: true, volume: true, kwType: true },
      orderBy: { volume: "desc" },
      take: 800,
    }).catch(() => []),
    prisma.gscTriageResult.findMany({
      where: { storeId, impressions: { gt: 0 } },
      select: { keyword: true, clicks: true, impressions: true, position: true },
      orderBy: { impressions: "desc" },
      take: 400,
    }).catch(() => []),
  ]);

  // Pre-compute stems for each cluster so we can fuzzy-match GSC queries.
  const clusterStems = clusters.map(c => ({
    aiTag: c.aiTag,
    stems: tokenStems(c.aiTag),
  }));

  const kwByTag = new Map();
  for (const k of keywords) {
    if (!kwByTag.has(k.parentTag)) kwByTag.set(k.parentTag, []);
    kwByTag.get(k.parentTag).push(k);
  }

  const gscByTag = new Map();
  for (const g of gscRows) {
    const norm = normText(g.keyword);
    for (const cs of clusterStems) {
      if (cs.stems.length === 0) continue;
      if (cs.stems.some(s => norm.includes(s))) {
        if (!gscByTag.has(cs.aiTag)) gscByTag.set(cs.aiTag, []);
        gscByTag.get(cs.aiTag).push(g);
        break; // assign each GSC query to first matching cluster only
      }
    }
  }

  return clusters.map(c => ({
    ...c,
    keywords: (kwByTag.get(c.aiTag) || []).slice(0, 10),
    gscQueries: (gscByTag.get(c.aiTag) || []).slice(0, 8),
    quality: {
      hasKeywords: (kwByTag.get(c.aiTag) || []).length > 0,
      hasGsc: (gscByTag.get(c.aiTag) || []).length > 0,
    },
  }));
}

// Heuristic modifier extraction from raw text: looks for "pentru X" patterns
// and adjective trailers. Used as candidate pool before AI cleanup.
function extractHeuristicModifiers(cluster) {
  const candidates = new Set();
  const stems = tokenStems(cluster.aiTag);

  // From titles: "X pentru Y" → take Y
  for (const t of cluster.sampleTitles) {
    const m = t.match(/\bpentru\s+([\p{L}\s]{3,30})/iu);
    if (m) candidates.add(m[1].trim().toLowerCase());
  }
  // From GSC queries: strip the cluster stem, keep the rest
  for (const g of cluster.gscQueries || []) {
    let rest = normText(g.keyword);
    for (const s of stems) rest = rest.replace(s, " ");
    rest = rest.replace(/\b(pentru|de|cu|si|sau|in|pe|la|cele|mai|bune|bun)\b/g, " ")
              .replace(/\s+/g, " ").trim();
    if (rest.length >= 3 && rest.length <= 40) candidates.add(rest);
  }
  // From keyword research: same strip
  for (const k of cluster.keywords || []) {
    let rest = normText(k.keyword);
    for (const s of stems) rest = rest.replace(s, " ");
    rest = rest.replace(/\b(pentru|de|cu|si|sau|in|pe|la|cele|mai|bune|bun)\b/g, " ")
              .replace(/\s+/g, " ").trim();
    if (rest.length >= 3 && rest.length <= 40) candidates.add(rest);
  }
  // From aiSub
  for (const sub of cluster.aiSubs || []) {
    if (sub.length >= 3) candidates.add(sub.toLowerCase());
  }
  return [...candidates].slice(0, 12);
}

// One batched AI call that takes all clusters and a field-extraction task,
// returns a per-cluster array of normalized values. Used by every pattern's
// suggester to deduplicate/clean the heuristic candidates and fill gaps.
async function aiCleanupPerCluster(clusters, taskDescription, fieldName, maxPerCluster = 6) {
  if (clusters.length === 0) return {};
  const clusterBlocks = clusters.map((c, i) => {
    const candidatesStr = c._candidates && c._candidates.length
      ? `\n  Candidaturi din date: ${c._candidates.join(", ")}`
      : "";
    const titlesStr = c.sampleTitles.slice(0, 5).map(t => `  - ${t}`).join("\n");
    const subsStr = c.aiSubs.length ? `\n  aiSubs: ${c.aiSubs.join(", ")}` : "";
    const kwStr = (c.keywords || []).length
      ? `\n  Keywords (vol): ${c.keywords.slice(0, 5).map(k => `${k.keyword} (${k.volume})`).join(", ")}`
      : "";
    const gscStr = (c.gscQueries || []).length
      ? `\n  GSC queries (imp): ${c.gscQueries.slice(0, 4).map(g => `${g.keyword} (${g.impressions}i)`).join(", ")}`
      : "";
    return `[${i + 1}] aiTag="${c.aiTag}" (${c.productCount} produse)\n${titlesStr}${subsStr}${kwStr}${gscStr}${candidatesStr}`;
  }).join("\n\n");

  const prompt = `Ești consultant SEO senior pentru un magazin online din România. Pentru fiecare cluster de produse listat mai jos, ${taskDescription}.

REGULI:
- Folosește DOAR semnalele din datele clusterului (titluri, aiSubs, keyword research, GSC queries, candidaturi extrase).
- NU inventa valori. Dacă nu există semnale clare pentru un cluster, returnează listă goală pentru acel cluster.
- Maxim ${maxPerCluster} valori per cluster, în lowercase, cu diacritice românești corecte.
- Termeni scurți (1-3 cuvinte), specifici, relevanți comercial.
- Dedupe synonime: "ambalare" și "ambalaje" → păstrează unul singur.

═══════════ CLUSTERE ═══════════
${clusterBlocks}

Returnează DOAR JSON valid (cheile sunt aiTag-urile EXACTE de mai sus):
{
${clusters.map(c => `  "${c.aiTag}": ["val1", "val2", ...]`).join(",\n")}
}`;

  try {
    const ai = await claudeJson(prompt, 1800);
    const result = {};
    for (const c of clusters) {
      const vals = Array.isArray(ai[c.aiTag]) ? ai[c.aiTag] : [];
      result[c.aiTag] = vals
        .map(v => String(v).toLowerCase().trim())
        .filter(v => v && v.length < 50)
        .slice(0, maxPerCluster);
    }
    return result;
  } catch (e) {
    console.error("[pSEO] aiCleanupPerCluster error:", e.message);
    // Fallback: return raw candidates per cluster
    const result = {};
    for (const c of clusters) {
      result[c.aiTag] = (c._candidates || []).slice(0, maxPerCluster);
    }
    return result;
  }
}

// Build the standard return envelope from a list of pairs. Derives field
// value lists from unique values in the pairs so the legacy cartesian
// fallback still works if _pairs is ever stripped.
function envelopeFromPairs(pairs, fields, warnings = []) {
  const result = { _pairs: pairs, _warnings: warnings };
  for (const f of fields) {
    result[f] = [...new Set(pairs.map(p => p[f]).filter(Boolean))];
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-pattern catalog-driven suggesters
// ─────────────────────────────────────────────────────────────────────────────

async function suggestPairsBestXForY(storeId) {
  const clustersRaw = await clusterByAiTag(storeId);
  if (clustersRaw.length === 0) {
    throw new Error("Niciun cluster aiTag cu produse. Rulează SEO Engine scan + AI Tagging mai întâi.");
  }
  const clusters = await attachDemandSignals(storeId, clustersRaw);

  // Filter to clusters with at least some demand signal OR strong product count
  const demandFiltered = clusters.filter(c =>
    c.quality.hasKeywords || c.quality.hasGsc || c.productCount >= 6
  );
  const warnings = [];
  if (demandFiltered.length < clusters.length) {
    warnings.push(`${clusters.length - demandFiltered.length} clustere ignorate (fără semnale de cerere)`);
  }

  // Attach heuristic candidates
  for (const c of demandFiltered) c._candidates = extractHeuristicModifiers(c);

  const useCasesByTag = await aiCleanupPerCluster(
    demandFiltered,
    "extrage 3-6 USE CASE-uri specifice (utilizări/ocazii) — răspunde la 'pentru ce se folosește acest produs?'",
    "useCase",
    6
  );

  const pairs = [];
  for (const c of demandFiltered) {
    const cases = useCasesByTag[c.aiTag] || [];
    for (const uc of cases) {
      pairs.push({ productType: c.aiTag, useCase: uc, _productCount: c.productCount });
    }
  }

  return envelopeFromPairs(pairs, ["productType", "useCase"], warnings);
}

async function suggestPairsAttributeX(storeId) {
  const clustersRaw = await clusterByAiTag(storeId);
  if (clustersRaw.length === 0) throw new Error("Niciun cluster aiTag. Rulează SEO Engine scan + AI Tagging.");
  const clusters = await attachDemandSignals(storeId, clustersRaw);

  for (const c of clusters) c._candidates = extractHeuristicModifiers(c);

  const attrsByTag = await aiCleanupPerCluster(
    clusters,
    "extrage 3-6 ATRIBUTE FIZICE/VIZUALE (adjective, culori, materiale, dimensiuni) — răspunde la 'cum arată sau din ce e făcut produsul?' (ex: 'din piele', 'lungi', 'roșii', 'mari')",
    "attribute",
    6
  );

  const pairs = [];
  for (const c of clusters) {
    const attrs = attrsByTag[c.aiTag] || [];
    for (const a of attrs) {
      pairs.push({ attribute: a, productType: c.aiTag, _productCount: c.productCount });
    }
  }

  return envelopeFromPairs(pairs, ["attribute", "productType"]);
}

async function suggestPairsXvsY(storeId) {
  const clustersRaw = await clusterByAiTag(storeId);
  if (clustersRaw.length < 2) throw new Error("Sub 2 clustere — comparațiile nu au sens. Rulează SEO Engine scan + AI Tagging.");
  const clusters = await attachDemandSignals(storeId, clustersRaw);

  // Comparison pairs: clusters that share at least one aiSub (= same comparison
  // space) OR appear in the same GSC query stem.
  const pairs = [];
  const seen = new Set();
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i], b = clusters[j];
      const sharedSub = a.aiSubs.some(s => b.aiSubs.includes(s));
      if (!sharedSub) continue;
      const key = [a.aiTag, b.aiTag].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ productA: a.aiTag, productB: b.aiTag, _productCount: Math.min(a.productCount, b.productCount) });
      if (pairs.length >= 80) break;
    }
    if (pairs.length >= 80) break;
  }

  const warnings = [];
  if (pairs.length === 0) {
    warnings.push("Niciun cluster nu partajează un aiSub — comparațiile nu pot fi generate. Adaugă aiSub-uri în SEO Engine sau folosește alt pattern.");
  }
  return envelopeFromPairs(pairs, ["productA", "productB"], warnings);
}

async function suggestPairsXUnderPrice(storeId) {
  const clustersRaw = await clusterByAiTag(storeId);
  if (clustersRaw.length === 0) throw new Error("Niciun cluster aiTag. Rulează SEO Engine scan + AI Tagging.");
  const clusters = await attachDemandSignals(storeId, clustersRaw);

  // Demand-aware: only clusters with at least some signal get price pages
  const eligible = clusters.filter(c => c.quality.hasKeywords || c.quality.hasGsc || c.productCount >= 6);
  const thresholds = priceLimitSuggestions();

  const pairs = [];
  for (const c of eligible) {
    for (const p of thresholds) {
      pairs.push({ productType: c.aiTag, priceLimit: p, _productCount: c.productCount });
    }
  }

  return envelopeFromPairs(pairs, ["productType", "priceLimit"]);
}

async function suggestPairsXInLocation(storeId) {
  const clustersRaw = await clusterByAiTag(storeId);
  if (clustersRaw.length === 0) throw new Error("Niciun cluster aiTag. Rulează SEO Engine scan + AI Tagging.");
  const clusters = await attachDemandSignals(storeId, clustersRaw);

  // Demand-aware filter: only clusters with proven search interest get
  // location pages. Otherwise we'd publish "rochii in slatina" for a store
  // with no rochii demand anywhere — pure thin-content risk.
  const eligible = clusters.filter(c => c.quality.hasKeywords || c.quality.hasGsc || c.productCount >= 8);

  // Cap cities to the top 15 by default to avoid generating 500+ pages on
  // first try. Merchants can edit RO_CITIES before re-running if they want
  // more coverage.
  const cities = RO_CITIES.slice(0, 15);

  const pairs = [];
  for (const c of eligible) {
    for (const city of cities) {
      pairs.push({ productType: c.aiTag, location: city, _productCount: c.productCount });
    }
  }

  const warnings = [];
  if (eligible.length < clusters.length) {
    warnings.push(`${clusters.length - eligible.length} clustere ignorate (fără semnale de cerere)`);
  }
  warnings.push("Locațiile sunt valori generice — produsele tale nu sunt fizic localizate, dar pattern-ul captează cererea cu intent local ('rochii în cluj').");

  return envelopeFromPairs(pairs, ["productType", "location"], warnings);
}

async function suggestPairsGiftGuide(storeId) {
  const clustersRaw = await clusterByAiTag(storeId);
  if (clustersRaw.length === 0) throw new Error("Niciun cluster aiTag. Rulează SEO Engine scan + AI Tagging.");
  const clusters = await attachDemandSignals(storeId, clustersRaw);

  // Detect "gift-suitable" clusters: aiSub or GSC contains gift/cadou stems
  const giftStems = ["cadou", "gift", "ocaz", "sarba"];
  const giftable = clusters.filter(c => {
    const sig = (c.aiSubs.join(" ") + " " + (c.gscQueries || []).map(g => g.keyword).join(" ")).toLowerCase();
    return giftStems.some(s => sig.includes(s)) || c.productCount >= 8;
  });

  if (giftable.length === 0) {
    return envelopeFromPairs([], ["recipient", "occasion"],
      ["Niciun cluster nu pare orientat pe cadouri. Rulează keyword research sau așteaptă date GSC cu intent de cadou."]);
  }

  // For each giftable cluster, ask AI for (recipient, occasion) pairs that fit
  for (const c of giftable) c._candidates = extractHeuristicModifiers(c);
  const giftPairsByTag = await aiCleanupPerCluster(
    giftable,
    `extrage 3-6 perechi 'recipient|occasion' separate prin '|' (ex: 'mama|crăciun', 'el|ziua de naștere'). Răspunde 'cui i s-ar potrivi acest produs ca cadou, pentru ce ocazie?'`,
    "giftPair",
    6
  );

  const pairs = [];
  for (const c of giftable) {
    const raw = giftPairsByTag[c.aiTag] || [];
    for (const r of raw) {
      const parts = String(r).split("|").map(s => s.trim().toLowerCase());
      if (parts.length === 2 && parts[0] && parts[1]) {
        pairs.push({ recipient: parts[0], occasion: parts[1], _productCount: c.productCount });
      }
    }
  }

  return envelopeFromPairs(pairs, ["recipient", "occasion"]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Intelligent token suggestions from catalog (auto-fill)
// ─────────────────────────────────────────────────────────────────────────────

const PATTERN_TOKEN_SPEC = {
  BEST_X_FOR_Y: {
    fields: ["productType", "useCase"],
    desc: {
      productType: "tipul de produs (ex: rochii, pantofi, genți, lumânări). Termeni scurți, la plural, fără brand-uri.",
      useCase: "utilizarea/ocazia pentru care se caută produsul (ex: birou, nuntă, plajă, cadou, spa). Termeni scurți.",
    },
  },
  ATTRIBUTE_X: {
    fields: ["attribute", "productType"],
    desc: {
      attribute: "un atribut vizual/fizic (ex: roșii, din piele, lungi, mari). Termeni scurți, la plural, acordați gramatical cu productType.",
      productType: "tipul de produs (ex: rochii, pantofi, genți). Termeni scurți, la plural.",
    },
  },
  X_VS_Y: {
    fields: ["productA", "productB"],
    desc: {
      productA: "primul produs/categorie pentru comparație (singular).",
      productB: "al doilea produs/categorie pentru comparație (singular). Trebuie să aibă sens de comparat cu productA.",
    },
  },
  X_UNDER_PRICE: {
    fields: ["productType", "priceLimit"],
    desc: {
      productType: "tipul de produs (ex: rochii, pantofi). Termeni scurți, la plural.",
      priceLimit: "praguri de preț în lei (ex: 50, 100, 200, 500). Doar numere.",
    },
  },
  GIFT_GUIDE: {
    fields: ["recipient", "occasion"],
    desc: {
      recipient: "destinatarul cadoului (ex: ea, el, mama, tata, copii, colegi, prieteni).",
      occasion: "ocazia (ex: Crăciun, Paște, ziua de naștere, nuntă, 8 Martie).",
    },
  },
  X_IN_LOCATION: {
    fields: ["productType", "location"],
    desc: {
      productType: "tipul de produs (ex: rochii, pantofi). Termeni scurți, la plural.",
      location: "oraș sau județ din România (ex: bucurești, cluj, timișoara). Lowercase, fără diacritice.",
    },
  },
};

async function claudeJson(prompt, maxTokens = 1200) {
  const text = await callClaude(prompt, maxTokens);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in AI response");
  return JSON.parse(match[0]);
}

function priceLimitSuggestions() {
  // Sensible round price thresholds in RON for RO market
  return ["50", "100", "200", "300", "500", "1000"];
}

async function getCatalogSnapshot(storeId, limit = 150) {
  const [products, seoKws, gscTop, candidates] = await Promise.all([
    prisma.seoProduct.findMany({
      where: { storeId, status: { not: "deleted" } },
      select: { productTitle: true, aiTag: true, aiSub: true },
      orderBy: { updatedAt: "desc" },
      take: limit,
    }),
    // Existing keyword research with real DFS volume data
    prisma.seoKeyword.findMany({
      where: { storeId, volume: { gt: 10 } },
      select: { keyword: true, parentTag: true, volume: true, kwType: true },
      orderBy: { volume: "desc" },
      take: 80,
    }).catch(() => []),
    // Real queries from Google Search Console
    prisma.gscTriageResult.findMany({
      where: { storeId, impressions: { gt: 0 } },
      select: { keyword: true, clicks: true, impressions: true, position: true },
      orderBy: { impressions: "desc" },
      take: 60,
    }).catch(() => []),
    // Taxonomy candidates with DFS-enriched data
    prisma.seoCandidate.findMany({
      where: { storeId, volume: { gt: 10 } },
      select: { keyword: true, volume: true, difficulty: true },
      orderBy: { volume: "desc" },
      take: 40,
    }).catch(() => []),
  ]);

  const tagCounts = {};
  for (const p of products) {
    if (p.aiTag) tagCounts[p.aiTag.toLowerCase()] = (tagCounts[p.aiTag.toLowerCase()] || 0) + 1;
  }
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t]) => t);

  return { products, topTags, seoKws, gscTop, candidates, count: products.length };
}

export async function suggestTokensForPattern(storeId, pattern) {
  // Catalog-driven path (preferred). Reads the WHOLE catalog, groups by
  // aiTag, derives modifiers per cluster from real demand signals, and
  // returns explicit pairs (no global cartesian). Falls back to the old
  // global-sample approach only if the catalog has no aiTag clusters yet.
  try {
    switch (pattern) {
      case "BEST_X_FOR_Y":  return await suggestPairsBestXForY(storeId);
      case "ATTRIBUTE_X":   return await suggestPairsAttributeX(storeId);
      case "X_VS_Y":        return await suggestPairsXvsY(storeId);
      case "X_UNDER_PRICE": return await suggestPairsXUnderPrice(storeId);
      case "GIFT_GUIDE":    return await suggestPairsGiftGuide(storeId);
      case "X_IN_LOCATION": return await suggestPairsXInLocation(storeId);
    }
  } catch (e) {
    // If catalog-driven path fails for a reason worth surfacing (no clusters,
    // tagging not run, etc.) we just propagate. The legacy global-sample
    // fallback below only runs when we hit an unknown pattern.
    if (e.message?.includes("Rulează SEO Engine") || e.message?.includes("clustere")) throw e;
    console.error("[pSEO] catalog-driven failed, falling back:", e.message);
  }

  const spec = PATTERN_TOKEN_SPEC[pattern] || PATTERN_TOKEN_SPEC.BEST_X_FOR_Y;
  const catalog = await getCatalogSnapshot(storeId);

  if (catalog.count === 0) {
    throw new Error("Catalogul e gol. Rulează mai întâi scan + tag în SEO Engine.");
  }

  // Fast path for priceLimit — no AI needed
  const result = {};
  if (spec.fields.includes("priceLimit")) {
    result.priceLimit = priceLimitSuggestions();
  }

  // Build compact snapshot for Claude
  const productList = catalog.products
    .slice(0, 60)
    .map((p, i) => `${i + 1}. ${p.productTitle}${p.aiTag ? ` [${p.aiTag}${p.aiSub ? "/" + p.aiSub : ""}]` : ""}`)
    .join("\n");

  const topTagsStr = catalog.topTags.length ? catalog.topTags.join(", ") : "(fără aiTag încă)";

  const seoKwList = catalog.seoKws
    .slice(0, 40)
    .map((k) => `${k.keyword} (vol ${k.volume}, ${k.kwType || "t"})`)
    .join(", ") || "(fără keyword research)";

  const gscList = catalog.gscTop
    .slice(0, 30)
    .map((g) => `${g.keyword} (${g.impressions}i, poz ${g.position?.toFixed(1) || "?"})`)
    .join(", ") || "(fără date GSC)";

  const candidateList = catalog.candidates
    .slice(0, 20)
    .map((c) => `${c.keyword} (${c.volume})`)
    .join(", ") || "";

  const aiFields = spec.fields.filter((f) => f !== "priceLimit");
  if (aiFields.length === 0) return result;

  const fieldSpec = aiFields.map((f) => `  - "${f}": ${spec.desc[f]}`).join("\n");

  const prompt = `Ești consultant SEO senior pentru un magazin online din România. Analizează datele magazinului și sugerează valori pentru token-urile unor pagini SEO programatice.

─── SURSĂ 1: Catalog produse (${catalog.count} total, primele 60 listate) ───
Top tag-uri AI: ${topTagsStr}
${productList}

─── SURSĂ 2: Keyword research existent (cu volum real de la DataForSEO) ───
${seoKwList}

─── SURSĂ 3: Real queries din Google Search Console ───
${gscList}
${candidateList ? `\n─── SURSĂ 4: Candidate din taxonomy engine ───\n${candidateList}\n` : ""}

Pattern: "${pattern}". Tokeni:
${fieldSpec}

═══════════ TEST DE COERENȚĂ (cel mai important) ═══════════
Sistemul va face PRODUSUL CARTEZIAN al listelor tale (${aiFields.join(" × ")}). Înainte să adaugi o valoare în ORICE listă, simulează combinațiile cu valorile pe care le ai în CELELALTE liste.

Exemplu eșec: magazin de benzi adezive. Dacă pui "antistres" în useCase, combinația "benzi adezive pentru antistres" NU are sens comercial → NU pune "antistres" acolo.
Exemplu OK: "benzi adezive pentru ambalaje", "benzi adezive pentru reparații" — au sens → poți pune "ambalaje" și "reparații" în useCase.

REGULA: o valoare intră în listă DOAR dacă produsul ei cartezian cu CELELALTE valori formează ≥ 80% interogări sensibile pentru ACEST catalog. Dacă nu ești sigur, nu include valoarea.

═══════════ Reguli ═══════════
- 6-10 valori per token (mai puține și coerente > multe și aleatorii).
- Folosește valori care apar deja în catalog/keyword research/GSC.
- NU inventa categorii pe care magazinul NU le vinde.
- Lowercase + diacritice românești.
${aiFields.includes("productType") ? "- productType: plural natural ('rochii' nu 'rochie'), extras din top tag-uri și titluri.\n" : ""}${aiFields.includes("useCase") ? "- useCase: ocazii/utilizări PRACTICE pentru productType-urile sugerate (NU emoționale gen 'antistres' decât dacă magazinul vinde explicit produse antistres).\n" : ""}${aiFields.includes("attribute") ? "- attribute: adjective la plural acordate gramatical ('roșii', 'din piele').\n" : ""}${aiFields.includes("recipient") || aiFields.includes("occasion") ? "- Pentru gift guide: recipient × occasion realist pentru catalogul dat.\n" : ""}
Returnează DOAR JSON valid (fără text înainte/după):
{
${aiFields.map((f) => `  "${f}": ["val1", "val2", ...]`).join(",\n")}
}`;

  try {
    const ai = await claudeJson(prompt, 1400);
    for (const f of aiFields) {
      if (Array.isArray(ai[f])) {
        result[f] = ai[f]
          .map((v) => String(v).toLowerCase().trim())
          .filter((v) => v && v.length < 50)
          .slice(0, 12);
      }
    }
  } catch (e) {
    if (aiFields.includes("productType") && catalog.topTags.length) {
      result.productType = catalog.topTags.slice(0, 12);
    }
    result._error = e.message;
  }

  // No catalog post-validation here: literal `includes()` matching is too
  // brittle for Romanian morphology ("benzi adezive" vs catalog title
  // "banda adeziva"), and would drop legitimate values. The Preview Modal
  // does catalog matching with match counts visible per combination, which
  // is the right place for the merchant to make the call.
  return result;
}

export { PATTERN_DEFAULTS };
