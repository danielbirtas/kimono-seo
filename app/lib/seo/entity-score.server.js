// app/lib/seo/entity-score.server.js
// Entity-score scorer for the on-page audit. Extracts named entities (brands,
// products, technologies, attributes, places, certifications) from the page's
// title + description, computes a density-weighted score, and returns
// recommendations the audit UI surfaces alongside meta-title/desc/H1 findings.
//
// Why this exists: the 2026 GEO research (Princeton + multiple field studies)
// shows that LLMs grounding into RAG retrieval prefer pages with high entity
// density — they're the most "citable per word." A 1500-word blog with 4
// named entities loses to a 800-word page with 12 entities even when both
// rank identically on Google.
//
// Uses Claude Haiku for speed (~1.5s/page) and cost (~$0.0005/page).

const ANTHROPIC_API    = "https://api.anthropic.com/v1/messages";
const MODEL            = process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001";
const FETCH_TIMEOUT_MS = 30_000;

function sanitizeKey(raw) {
  return (raw || "").replace(/[^\x21-\x7E]/g, "");
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
        model:      MODEL,
        max_tokens: 1500,
        system:     systemPrompt,
        messages:   [{ role: "user", content: userPrompt }],
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

// Strip HTML, normalize whitespace. Description bodies arrive with markup.
function stripHtml(s) {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function wordCount(s) {
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

// Density-to-score mapping. Calibrated against the 2026 research finding that
// pages cited by AI Overviews carry roughly 1 entity per 30–80 words, with
// the top decile at 1 per ~20. We give 100 at ≥1/20, 0 at ≤1/200, sigmoid in
// between so the score moves meaningfully with the next entity added.
function densityToScore(density) {
  if (density <= 0) return 0;
  const idealOne = 1 / 20;   // 5%   → 100
  const floorOne = 1 / 200;  // 0.5% → 0
  if (density >= idealOne) return 100;
  if (density <= floorOne) return 0;
  const t = (density - floorOne) / (idealOne - floorOne);
  return Math.round(t * 100);
}

// Heuristic deficit message for the audit UI.
function buildEntityFindings({ entities, density, score, wordTotal }) {
  const findings = [];
  if (wordTotal < 30) {
    findings.push({
      field: "Entities",
      severity: "warning",
      title: "Content too short to score",
      message: `Only ${wordTotal} words analyzed — write a real description first.`,
      can_automate: false,
    });
    return findings;
  }
  if (entities.length === 0) {
    findings.push({
      field: "Entities",
      severity: "error",
      title: "No named entities detected",
      message: "AI grounding (AI Overviews, ChatGPT, Perplexity) preferă paginile cu entități clare. Adaugă atribute, branduri, certificări, măsuri.",
      suggestion: "Adaugă brand name, model, dimensiuni, certificări (CE/RoHS/IP-rating), materiale, ingrediente, regiune de origine.",
      can_automate: false,
    });
    return findings;
  }

  const densityPct = (density * 100).toFixed(2);
  if (score >= 80) {
    findings.push({
      field: "Entities",
      severity: "ok",
      title: "Strong entity density",
      message: `${entities.length} entități distincte / ${wordTotal} cuvinte (${densityPct}%) — citation-ready.`,
      can_automate: false,
    });
  } else if (score >= 50) {
    findings.push({
      field: "Entities",
      severity: "warning",
      title: "Mediu — mai pot fi adăugate",
      message: `${entities.length} entități / ${wordTotal} cuvinte (${densityPct}%). Țintă: ~1 entitate la 30 cuvinte.`,
      suggestion: "Adaugă atribute concrete: dimensiuni, materiale, standarde, branduri compatibile, regiune.",
      can_automate: false,
    });
  } else {
    findings.push({
      field: "Entities",
      severity: "error",
      title: "Densitate entități scăzută",
      message: `Doar ${entities.length} entități pe ${wordTotal} cuvinte (${densityPct}%). LLM-urile prefer pagini cu ≥1/30 cuvinte.`,
      suggestion: "Rescrie descrierea concentrând atribute factuale (specs, standarde, branduri, certificări) — taie umplutura.",
      can_automate: false,
    });
  }

  // Top entities preview helps the merchant see what was found.
  const top = entities.slice(0, 6).map(e => e.name).join(", ");
  if (top) {
    findings.push({
      field: "Entities",
      severity: "info",
      title: "Entități recunoscute",
      message: top + (entities.length > 6 ? ` … +${entities.length - 6}` : ""),
      can_automate: false,
    });
  }
  return findings;
}

// Build system prompt once — reused by single and batch.
function entitySystemPrompt(language) {
  return language === "en"
    ? `You are a named-entity extractor for e-commerce SEO grounding. Extract every concrete, citable entity from each product text — brands, model names, materials, ingredients, certifications, standards (CE, IP67, FDA), measurements with units, places, technologies, compatible products. SKIP generic adjectives ("great", "premium", "high quality"). JSON only, no prose, no markdown fences.`
    : `Ești un extractor de entități pentru SEO grounding e-commerce. Extrage fiecare entitate concretă, citabilă, din textul produsului — branduri, modele, materiale, ingrediente, certificări, standarde (CE, IP67), măsuri cu unități, locuri, tehnologii, produse compatibile. NU include adjective generice ("excelent", "premium", "calitate superioară"). Doar JSON, fără markdown.`;
}

// Parse raw AI response into deduplicated entity list + score.
function parseEntityResponse(raw, words) {
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```\s*$/, "").trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); } catch { return null; }
  if (!Array.isArray(parsed)) return null;

  const byName = new Map();
  for (const e of parsed) {
    if (!e?.name || typeof e.name !== "string") continue;
    const key = e.name.trim().toLowerCase();
    if (!key) continue;
    const sal = Math.max(0, Math.min(1, Number(e.salience) || 0.3));
    const existing = byName.get(key);
    if (!existing || existing.salience < sal) {
      byName.set(key, { name: e.name.trim(), type: String(e.type || "").slice(0, 32), salience: sal });
    }
  }
  const entities = [...byName.values()].sort((a, b) => b.salience - a.salience);
  const density  = entities.length / words;
  const score    = densityToScore(density);
  return { entities, count: entities.length, density, score, words, findings: buildEntityFindings({ entities, density, score, wordTotal: words }) };
}

// Single-product entry (kept for backward compat).
export async function scoreProductEntities({ title, description, language = "ro" }) {
  const results = await scoreProductEntitiesBatch([{ id: "single", title, description }], language);
  return results.get("single") || null;
}

// Batch entry: score multiple products in chunked AI calls. ~10x cheaper than 1-per-product.
// Returns Map<productId, result>.
const ENTITY_CHUNK = 10; // max products per AI call (50 caused Anthropic 400)

export async function scoreProductEntitiesBatch(products, language = "ro") {
  const results = new Map();
  const apiKey  = sanitizeKey(process.env.ANTHROPIC_API_KEY);
  if (!apiKey) return results;

  // Prep texts, skip too-short products
  const items = [];
  for (const p of products) {
    const plainDesc = stripHtml(p.description || "");
    const fullText  = [p.title, plainDesc].filter(Boolean).join("\n");
    const words     = wordCount(fullText);
    if (words < 5) {
      results.set(p.id, { entities: [], count: 0, density: 0, score: 0, words, findings: buildEntityFindings({ entities: [], density: 0, score: 0, wordTotal: words }) });
    } else {
      items.push({ id: p.id, text: fullText.slice(0, 800), words });
    }
  }
  if (items.length === 0) return results;

  // Process in chunks to avoid Anthropic 400 on oversized prompts
  for (let ci = 0; ci < items.length; ci += ENTITY_CHUNK) {
    const chunk = items.slice(ci, ci + ENTITY_CHUNK);
    const chunkResults = await _scoreEntityChunk(chunk, language, apiKey);
    for (const [k, v] of chunkResults) results.set(k, v);
  }
  return results;
}

async function _scoreEntityChunk(items, language, apiKey) {
  const results = new Map();

  const systemPrompt = entitySystemPrompt(language);
  const productList  = items.map((it, i) => `[Product ${i + 1} id="${it.id}"]:\n${it.text}`).join("\n\n---\n\n");

  const userPrompt = language === "en"
    ? `Extract entities for each product below. Return a JSON object where keys are product ids and values are arrays of entities:\n{"product_id": [{"name": "...", "type": "brand|product|material|standard|measurement|place|technology|certification|ingredient", "salience": 0.0-1.0}]}\n\n${productList}`
    : `Extrage entități pentru fiecare produs. Returnează JSON cu chei = product id, valori = array de entități:\n{"product_id": [{"name": "...", "type": "brand|product|material|standard|measurement|place|technology|certification|ingredient", "salience": 0.0-1.0}]}\n\n${productList}`;

  let message;
  try {
    const ac = new AbortController();
    const t  = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(ANTHROPIC_API, {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          model: MODEL,
          max_tokens: Math.min(4000, items.length * 400),
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        throw new Error(`Anthropic ${resp.status}: ${errBody.slice(0, 200)}`);
      }
      message = await resp.json();
    } finally { clearTimeout(t); }
  } catch (e) {
    console.warn("[EntityScore batch]", e.message);
    return results;
  }

  const raw = (message.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```\s*$/, "").trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); } catch {
    // Fallback: try as flat array (single product response)
    const arrResult = parseEntityResponse(raw, items[0]?.words || 0);
    if (arrResult && items.length === 1) results.set(items[0].id, arrResult);
    return results;
  }

  // Parse per-product results from the object
  for (const item of items) {
    const entityArr = parsed[item.id] || parsed[String(item.id)];
    if (!Array.isArray(entityArr)) continue;
    const fakeRaw = JSON.stringify(entityArr);
    const result  = parseEntityResponse(fakeRaw, item.words);
    if (result) results.set(item.id, result);
  }

  return results;
}
