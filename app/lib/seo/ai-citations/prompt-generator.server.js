// app/lib/seo/ai-citations/prompt-generator.server.js
// Seed a prompt library for a merchant by asking Claude to generate realistic
// buyer prompts based on their actual product catalog. Batch count scales with
// catalog size so small stores stay cheap while large catalogs (e.g. Vivimall
// with 30k SKUs across many verticals) get true long-tail coverage.

import prisma from "../../../db.server.js";
import { hashPrompt } from "./extractors.server.js";

const ANTHROPIC_API     = "https://api.anthropic.com/v1/messages";
const MODEL             = process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6";
const FETCH_TIMEOUT_MS  = 60_000;
const RETRY_DELAY_MS    = 1500;
const SAMPLE_SIZE       = 30;
const MAX_CATEGORIES    = 10;

function decideBatchCount(totalProducts) {
  if (totalProducts < 50)   return 1;
  if (totalProducts < 500)  return 2;
  if (totalProducts < 5000) return 3;
  return 5;
}

// Pull a stratified sample of products: group by aiTag, round-robin pick from
// the top categories so each batch covers different parts of the catalog.
// Falls back to random skip-based sampling when no taxonomy has been assigned
// (e.g. a freshly-synced store that hasn't run SEO classification yet).
async function buildStratifiedSample(storeId, size, excludeIds) {
  const groups = await prisma.seoProduct.groupBy({
    by: ["aiTag"],
    where: { storeId, aiTag: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { aiTag: "desc" } },
    take: MAX_CATEGORIES,
  });

  if (groups.length === 0) {
    const total = await prisma.seoProduct.count({ where: { storeId } });
    if (total === 0) return [];
    const skip = Math.floor(Math.random() * Math.max(1, total - size));
    const products = await prisma.seoProduct.findMany({
      where: { storeId },
      select: { id: true, productTitle: true, aiTag: true },
      skip,
      take: size * 2,
    });
    return products.filter(p => !excludeIds.has(p.id)).slice(0, size);
  }

  const perCat = Math.max(3, Math.ceil(size / groups.length));
  const result = [];
  for (const g of groups) {
    const catTotal = g._count._all;
    const skip = Math.max(0, Math.floor(Math.random() * Math.max(1, catTotal - perCat)));
    const products = await prisma.seoProduct.findMany({
      where: { storeId, aiTag: g.aiTag },
      select: { id: true, productTitle: true, aiTag: true },
      skip,
      take: perCat * 2,
    });
    for (const p of products) {
      if (excludeIds.has(p.id)) continue;
      result.push(p);
      if (result.length >= size) break;
    }
    if (result.length >= size) break;
  }
  return result.slice(0, size);
}

function rewrapAnthropicError(e) {
  if (e.name === "AbortError") return new Error(`Anthropic timeout după ${FETCH_TIMEOUT_MS / 1000}s — încearcă din nou`);
  if (e.message === "fetch failed") {
    // undici TypeError("fetch failed") wraps the real socket error in err.cause.
    // Surface it so DNS / TLS / ECONNREFUSED / EOF problems are diagnosable instead of generic.
    const cause = e.cause;
    const code  = cause?.code || cause?.errno || cause?.name;
    const msg   = cause?.message || "no cause";
    return new Error(`Network error la Anthropic: ${code || "unknown"} — ${msg}`);
  }
  return e;
}

async function callAnthropicOnce({ apiKey, systemPrompt, userPrompt }) {
  const ac = new AbortController();
  const t  = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      signal: ac.signal,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      const err  = new Error(`Anthropic ${resp.status}: ${text.slice(0, 200)}`);
      err.status    = resp.status;
      err.transient = resp.status === 429 || resp.status >= 500;
      throw err;
    }
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

async function callAnthropic({ apiKey, systemPrompt, userPrompt }) {
  try {
    return await callAnthropicOnce({ apiKey, systemPrompt, userPrompt });
  } catch (e) {
    const isNetwork = e.name === "AbortError" || e.message === "fetch failed";
    if (!isNetwork && !e.transient) throw rewrapAnthropicError(e);
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    try {
      return await callAnthropicOnce({ apiKey, systemPrompt, userPrompt });
    } catch (e2) {
      throw rewrapAnthropicError(e2);
    }
  }
}

export async function generatePromptLibrary(storeId, { count = 25 } = {}) {
  // Strip every non-printable ASCII char — Railway env vars sometimes pick up newlines /
  // smart quotes / zero-width spaces from clipboard, which makes undici reject the header
  // with UND_ERR_INVALID_ARG. Anthropic keys are sk-ant-api03-… i.e. pure printable ASCII.
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").replace(/[^\x21-\x7E]/g, "");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const [brandConfig, storeSettings, totalProducts] = await Promise.all([
    prisma.aiBrandConfig.findUnique({ where: { storeId } }),
    prisma.storeSettings.findUnique({ where: { storeId } }),
    prisma.seoProduct.count({ where: { storeId } }),
  ]);
  if (!brandConfig) throw new Error("Configure brand first (Settings → AI Citations)");
  const brandName  = brandConfig.brandName;
  const batchCount = decideBatchCount(totalProducts);
  const lang       = (storeSettings?.aiLanguage || "ro").toLowerCase() === "en" ? "en" : "ro";

  // Locale-locked system prompt. Two failure modes from the previous version:
  // (1) Claude mixed RO/EN because the system prompt itself was in English with
  //     English examples — model defaulted to mimicking the prompt's language.
  // (2) "Diverse across specificity" pushed the model to stack attributes, producing
  //     unnatural keyword-stuffed prompts ("cadouri 1 martie set mărțișoare tradiționale
  //     românești broșe") that no human would type into a chatbot. Real buyer prompts
  //     are 3–10 words and conversational.
  const systemPrompt = lang === "ro"
    ? `Generezi întrebări scurte și NATURALE pe care un cumpărător român le-ar tasta în ChatGPT, Claude sau Perplexity.

LIMBA OBLIGATORIE: română. Fiecare prompt, fără excepție, în română corectă. Niciun cuvânt în engleză.

NATURALEȚE — fiecare prompt trebuie să sune ca o întrebare reală scrisă de o persoană:
- 3–10 cuvinte (12 maximum, doar excepțional)
- Conversațional, NU listă de keywords SEO
- Cum scrii într-un chatbot, nu cum optimizezi un titlu

EVITĂ ABSOLUT:
- Înșiruirea de atribute ("tigaie 28cm fontă inducție bucătărie mâner")
- Modificatorii multipli ("pentru X cu Y în Z buget mic")
- Cuvinte de umplutură ("set pentru mai multe persoane", "pentru amenajare apartament")
- Termeni tehnici pe care un cumpărător casual nu-i scrie

INTENȚII (distribuție aproximativă):
- 40% commercial ("cea mai bună tigaie pentru inducție", "recomandare aparat foto începători")
- 30% informational ("cum aleg o tigaie bună", "ce trebuie să știu despre tapet 3D")
- 20% comparison ("tigaie fontă vs inox", "tapet 3D sau zugrăvit")
- 10% navigational ("review tigai fontă", "păreri tapet 3D autoadeziv")

NU include brandul "${brandName}" în prompts — vrem să vedem dacă AI-ul îl găsește singur.

Output: JSON array de ${count} obiecte {"text": "...", "intent": "commercial|informational|comparison|navigational"}.
Doar JSON, fără markdown.`
    : `You generate short, NATURAL questions a buyer would type into ChatGPT, Claude or Perplexity.

REQUIRED LANGUAGE: English. Every prompt, no exceptions, in natural English.

NATURALNESS — each prompt must sound like a real question someone writes:
- 3–10 words (12 max, only exceptionally)
- Conversational, NOT SEO keyword lists
- How you write to a chatbot, not how you optimize an H1

AVOID ABSOLUTELY:
- Attribute stacking ("28cm cast iron pan induction kitchen wide handle")
- Multiple modifiers ("for X with Y on Z budget")
- Filler phrases ("set for multiple people", "for apartment decoration")
- Technical jargon casual buyers don't type

INTENT MIX (approximate):
- 40% commercial ("best induction frying pan", "good camera for beginners")
- 30% informational ("how do I choose a good pan", "what to know about 3D wallpaper")
- 20% comparison ("cast iron vs stainless pan", "3D wallpaper vs paint")
- 10% navigational ("cast iron pan reviews", "3D wallpaper reviews")

DO NOT include the brand "${brandName}" in prompts — we measure whether the AI surfaces it spontaneously.

Output: JSON array of ${count} objects {"text": "...", "intent": "commercial|informational|comparison|navigational"}.
JSON only, no markdown.`;

  const seenIds        = new Set();
  let totalGenerated   = 0;
  let totalInserted    = 0;
  const errors         = [];

  for (let batch = 0; batch < batchCount; batch++) {
    const sample = await buildStratifiedSample(storeId, SAMPLE_SIZE, seenIds);
    if (sample.length === 0 && batch > 0) break;
    sample.forEach(p => seenIds.add(p.id));

    const productSample  = sample.map(p => `- ${p.productTitle}${p.aiTag ? ` [${p.aiTag}]` : ""}`).join("\n");
    const categoriesSeen = [...new Set(sample.map(p => p.aiTag).filter(Boolean))];
    const categoriesLine = categoriesSeen.length ? `Categories represented: ${categoriesSeen.join(", ")}\n` : "";

    const userPrompt = lang === "ro"
      ? `Brand: ${brandName}
${categoriesLine ? "Categorii reprezentate: " + categoriesSeen.join(", ") + "\n" : ""}Produse din catalog (batch ${batch + 1} din ${batchCount}):
${productSample || "(catalog nesincronizat)"}

Generează ${count} prompts diverse pe care un cumpărător român le-ar tasta într-un chatbot pentru aceste categorii. Scurte, naturale, în română.`
      : `Brand: ${brandName}
${categoriesLine}Catalog products (batch ${batch + 1} of ${batchCount}):
${productSample || "(catalog not yet synced)"}

Generate ${count} diverse, natural buyer prompts a real shopper would type into a chatbot covering these categories.`;

    let message;
    try {
      message = await callAnthropic({ apiKey, systemPrompt, userPrompt });
    } catch (e) {
      // First batch failing = no useful output yet, surface immediately.
      // Later batches failing = keep what we have, report partial.
      if (batch === 0) throw e;
      errors.push(`Batch ${batch + 1}: ${e.message}`);
      continue;
    }

    const text    = (message.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```\s*$/, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      errors.push(`Batch ${batch + 1}: unparseable JSON`);
      continue;
    }
    if (!Array.isArray(parsed)) {
      errors.push(`Batch ${batch + 1}: expected JSON array`);
      continue;
    }
    totalGenerated += parsed.length;

    for (const p of parsed) {
      if (!p.text || typeof p.text !== "string") continue;
      const textTrimmed = p.text.trim();
      try {
        await prisma.aiPrompt.create({
          data: {
            storeId,
            text:     textTrimmed,
            intent:   p.intent || null,
            source:   "ai-generated",
            status:   "active",
            textHash: hashPrompt(textTrimmed),
          },
        });
        totalInserted++;
      } catch (e) {
        if (e.code !== "P2002") console.warn("[PromptGen] insert failed:", e.message);
      }
    }
  }

  return { generated: totalGenerated, inserted: totalInserted, batches: batchCount, errors };
}
