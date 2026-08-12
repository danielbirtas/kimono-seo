// app/lib/seo/title-normalizer.server.js
//
// Detects stuffed product titles (Vivimall-style) and generates a compact
// SEO-friendly variant used PURELY for keyword extraction. The original
// Shopify product title is never modified — the normalized title only feeds
// the Extract step so AI candidates aren't drowned by descriptive noise.
//
// Why: AI extract on titles like "Set 10 x Placi Tapet Autocolant 3D cu
// Imitatie de Marmura, pentru Perete Bucatarie Sufragerie, Usor de Curatat,
// Rezistent la Apa, Autoadeziv, 30x30 cm, Alb Negru" misses the obvious
// commercial combinations ("tapet autoadeziv bucatarie") because the signal
// is buried in 17 tokens. On compact titles like "Prelata Acoperis Cort 3X3M
// Impermeabila | FlexiCover", the same AI returns excellent candidates.
//
// Strategy:
//  1. detectStuffed(title) — heuristic, no API call (free, fast)
//  2. normalize(title) — Claude Haiku call only for stuffed titles
//  3. SeoProduct.normalizedTitle stored for reuse across pipeline runs

import prisma from "../../db.server.js";

const ANTHROPIC_API_URL  = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION  = "2023-06-01";
const FETCH_TIMEOUT_MS   = 30_000;
const FAST_MODEL         = process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001";

// Heuristic thresholds — calibrated on Vivimall sample. Titles that meet
// ANY of these conditions get normalized. Below all of them, the original
// is good enough.
const STUFFED_MIN_CHARS       = 80;
const STUFFED_MIN_TOKENS      = 12;
const STUFFED_COMMA_DENSITY   = 0.15;  // commas / tokens; >0.15 = listy
const STUFFED_MIN_ATTRIBUTES  = 4;     // adjectives/specs comma-separated

function tokenize(s) {
  return String(s || "")
    .replace(/[|·•\-—–]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function detectStuffed(title) {
  if (!title) return { stuffed: false, reason: "empty" };
  const chars  = title.length;
  const tokens = tokenize(title);
  const commas = (title.match(/,/g) || []).length;
  const tokenCount = tokens.length;
  const density = tokenCount > 0 ? commas / tokenCount : 0;

  const flags = [];
  if (chars  >= STUFFED_MIN_CHARS)              flags.push(`chars=${chars}`);
  if (tokenCount >= STUFFED_MIN_TOKENS)         flags.push(`tokens=${tokenCount}`);
  if (density >= STUFFED_COMMA_DENSITY)         flags.push(`comma_density=${density.toFixed(2)}`);
  if (commas >= STUFFED_MIN_ATTRIBUTES)         flags.push(`commas=${commas}`);

  return {
    stuffed: flags.length >= 2,  // require ≥2 signals to avoid false positives
    chars,
    tokens: tokenCount,
    commas,
    density,
    flags,
    reason: flags.length >= 2 ? `stuffed (${flags.join(", ")})` : "clean",
  };
}

async function callHaiku(systemPrompt, userPrompt, maxTokens = 200) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").replace(/[^\x21-\x7E]/g, "");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const ac = new AbortController();
  const t  = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(ANTHROPIC_API_URL, {
      method:  "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION, "Content-Type": "application/json" },
      signal:  ac.signal,
      body:    JSON.stringify({
        model:      FAST_MODEL,
        max_tokens: maxTokens,
        system:     [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages:   [{ role: "user", content: userPrompt }],
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Anthropic ${resp.status}: ${text.slice(0, 200)}`);
    }
    const data = await resp.json();
    return (data.content?.[0]?.text || "").trim();
  } finally {
    clearTimeout(t);
  }
}

// Pure rewrite — Claude Haiku is cheap and good at this single task.
// We strictly bound the output via the prompt + a regex pass after.
const SYSTEM_PROMPT = "Esti expert SEO Romania. Returnezi DOAR titlul compact cerut, fara explicatii, fara ghilimele, fara markdown.";

function buildUserPrompt(originalTitle, productType, vendor) {
  return `Reformuleaza acest titlu de produs Shopify intr-o forma SEO compacta de 40-70 caractere.

TITLU ORIGINAL:
${originalTitle}

${productType ? `Tip produs (din Shopify): ${productType}\n` : ""}${vendor ? `Brand: ${vendor}\n` : ""}
REGULI:
- Pastreaza: tipul de produs, atributele cheie (material, dimensiune, culoare daca relevant), brand-ul daca exista
- Sterge: liste lungi de feature-uri (rezistent la apa, usor de curatat etc.), formularile "pentru X Y Z", duplicate
- Ordine: [tip produs] [atribut principal] [atribut secundar] [dimensiune] [brand]
- Fara virgule. Fara "Set X buc" daca nu e esential.
- Fara cuvinte de umplutura: "pentru", "din material", "cu invelis", "de calitate"
- Tinta: 40-70 caractere, lowercase nu, mai degraba Title Case

EXEMPLE:
"Set 10 x Placi Tapet Autocolant 3D cu Imitatie de Marmura, pentru Perete Bucatarie Sufragerie, Usor de Curatat, Rezistent la Apa, Autoadeziv, 30x30 cm, Alb Negru"
→ "Placi Tapet 3D Marmura Autoadeziv 30x30 Alb Negru"

"Bicicleta Pentru Copii, Vivimall, Fara Pedale, Cu Patru Roti, Din Plastic Rezistent, Fara BPA, Cu Muzica Si Lumini, Model Dinozaur, 50x27x40 Cm, Roz"
→ "Bicicleta Copii Fara Pedale Dinozaur Roz Vivimall"

Returneaza DOAR titlul nou, nimic altceva.`;
}

function cleanOutput(text) {
  return String(text || "")
    .replace(/^["'`]+|["'`]+$/g, "")           // strip surrounding quotes
    .replace(/^titlu\s*[:\-]\s*/i, "")          // strip "Titlu: " prefix
    .replace(/^\s*[•\-\*]\s*/, "")              // strip bullet prefix
    .replace(/\n.*$/s, "")                      // first line only
    .trim();
}

export async function normalizeTitle({ productTitle, productType, vendor }) {
  if (!productTitle) return { normalized: null, used: "empty", originalLength: 0 };

  const det = detectStuffed(productTitle);
  if (!det.stuffed) {
    return { normalized: productTitle, used: "passthrough", detection: det };
  }

  const rawOutput = await callHaiku(SYSTEM_PROMPT, buildUserPrompt(productTitle, productType, vendor));
  const compact   = cleanOutput(rawOutput);

  // Safety: if AI output is garbage (>120 chars, empty, or longer than original),
  // fall back to a deterministic truncation of original
  if (!compact || compact.length > 120 || compact.length >= productTitle.length) {
    const fallback = productTitle.split(",")[0].trim().slice(0, 80);
    return { normalized: fallback, used: "fallback_truncate", detection: det, aiOutput: rawOutput };
  }

  return { normalized: compact, used: "ai_haiku", detection: det };
}

// Cache-first reader. Uses DB-stored normalizedTitle if fresh, otherwise
// generates and stores. Title hash detects upstream Shopify title changes
// so we re-normalize when the merchant edits.
export async function getNormalizedTitle(productId, storeId) {
  const product = await prisma.seoProduct.findFirst({
    where:  { storeId, productId },
    select: { id: true, productTitle: true, normalizedTitle: true, normalizedTitleAt: true, normalizedTitleHash: true },
  });
  if (!product) return null;

  const currentHash = simpleHash(product.productTitle);
  if (product.normalizedTitle && product.normalizedTitleHash === currentHash) {
    return { title: product.normalizedTitle, cached: true };
  }

  const result = await normalizeTitle({ productTitle: product.productTitle });
  await prisma.seoProduct.update({
    where: { id: product.id },
    data:  {
      normalizedTitle:     result.normalized,
      normalizedTitleAt:   new Date(),
      normalizedTitleHash: currentHash,
    },
  });
  return { title: result.normalized, cached: false, detail: result };
}

// Cheap deterministic hash (FNV-1a 32-bit) — used to detect title changes.
function simpleHash(s) {
  let h = 0x811c9dc5;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}
