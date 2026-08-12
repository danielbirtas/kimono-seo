// app/lib/seo/ai-citations/extractors.server.js
// Normalize citations + brand mentions from each LLM provider's response shape
// into a single internal schema. Each provider returns citations differently:
// - Anthropic: citations[] attached per text block with cited_text + url + title
// - OpenAI:    url_citation annotations w/ char offsets + a sources field
// - Perplexity: top-level citations[] or search_results[] with title/url/snippet
// - DataForSEO AIO: nested AI overview items with reference URLs

import crypto from "node:crypto";

// Registrable-domain extraction (strip subdomain). Cheap heuristic — good
// enough for grouping (reddit.com, wikipedia.org, vivimall.ro).
export function registrableDomain(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    // 2-label TLD heuristic: keep last 2 labels for .com/.ro/.eu etc., 3 for .co.uk etc.
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    const twoLabelTlds = new Set(["co.uk", "com.au", "co.jp", "co.in", "com.br", "com.mx"]);
    const last2 = parts.slice(-2).join(".");
    if (twoLabelTlds.has(last2)) return parts.slice(-3).join(".");
    return last2;
  } catch { return ""; }
}

// Hash for prompt dedup. Same prompt text → same hash → unique constraint.
export function hashPrompt(text) {
  return crypto.createHash("sha256").update(text.trim().toLowerCase()).digest("hex").slice(0, 32);
}

// ─── Brand mention detection ─────────────────────────────────────────────────
// Returns { mentioned, position, mentionCount, competitorsFound }.
// Position is 1-based ordinal IF the brand appears in a list-like context
// (numbered list, comma-separated enumeration of 3+ items). Otherwise null.
export function detectBrand(text, brandConfig, competitorBrands = []) {
  if (!text || !brandConfig) return { mentioned: false, position: null, mentionCount: 0, competitorsFound: [] };
  const aliases  = [brandConfig.brandName, ...(brandConfig.aliases || [])]
    .map(s => s.trim()).filter(Boolean);

  // Case-insensitive whole-word match for each alias.
  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const aliasRegex = new RegExp(`\\b(${aliases.map(escapeRe).join("|")})\\b`, "gi");
  const matches = [...text.matchAll(aliasRegex)];
  const mentioned = matches.length > 0;
  const mentionCount = matches.length;

  // Position detection: find the brand within numbered list or bullet
  let position = null;
  if (mentioned) {
    // Look for "1. ... <brand>" / "2. ... <brand>" patterns
    const numbered = [...text.matchAll(/^\s*(\d+)\.\s+(.+?)(?=\n\s*\d+\.|\n\n|$)/gms)];
    for (const m of numbered) {
      if (aliasRegex.test(m[2])) {
        aliasRegex.lastIndex = 0; // reset for next iteration
        position = parseInt(m[1], 10);
        break;
      }
      aliasRegex.lastIndex = 0;
    }
  }

  // Competitor detection (open-pool — track everyone listed)
  const competitorsFound = [];
  for (const comp of competitorBrands) {
    if (!comp) continue;
    const compRe = new RegExp(`\\b${escapeRe(comp)}\\b`, "i");
    if (compRe.test(text)) competitorsFound.push(comp);
  }

  return { mentioned, position, mentionCount, competitorsFound };
}

// ─── Citation normalizers per platform ───────────────────────────────────────
// Output shape: [{ url, domain, title, position, snippetText }]
export function citationsFromAnthropic(message) {
  const out = [];
  let position = 0;
  for (const block of message?.content || []) {
    if (block.type !== "text") continue;
    for (const cite of block.citations || []) {
      if (cite.type !== "web_search_result_location") continue;
      position++;
      out.push({
        url:         cite.url,
        domain:      registrableDomain(cite.url),
        title:       cite.title || null,
        position,
        snippetText: cite.cited_text || null,
      });
    }
  }
  return out;
}

export function citationsFromOpenAI(response) {
  // Responses API returns annotations on assistant message content items.
  const out = [];
  let position = 0;
  for (const item of response?.output || []) {
    if (item.type !== "message") continue;
    for (const part of item.content || []) {
      if (part.type !== "output_text") continue;
      for (const ann of part.annotations || []) {
        if (ann.type !== "url_citation") continue;
        position++;
        out.push({
          url:         ann.url,
          domain:      registrableDomain(ann.url),
          title:       ann.title || null,
          position,
          snippetText: null, // OpenAI does not return verbatim source text
        });
      }
    }
  }
  return out;
}

export function responseTextFromAnthropic(message) {
  return (message?.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
}

export function responseTextFromOpenAI(response) {
  const out = [];
  for (const item of response?.output || []) {
    if (item.type !== "message") continue;
    for (const part of item.content || []) {
      if (part.type === "output_text") out.push(part.text);
    }
  }
  return out.join("\n");
}

// ─── Google AI Overview (via DataForSEO) ─────────────────────────────────────
// DataForSEO returns the SERP items[] with an `ai_overview` type when Google
// surfaced one for the query. The block has markdown content + references.
// If no AIO triggered, we return empty citations and the response text comes
// from the items[] organic results so we can still detect brand mentions in
// the SERP itself (not just inside AIO — partial fallback).
export function aioFromDataForSEO(raw) {
  const items = raw?.result?.items || [];
  const aio = items.find(it => it.type === "ai_overview" || it.type === "ai_overview_element");
  if (!aio) return { citations: [], text: "", triggered: false };

  const citations = [];
  // The AI Overview block contains references array with {url, title, source}.
  const refs = aio.references || aio.references_v2 || [];
  for (let i = 0; i < refs.length; i++) {
    const r = refs[i];
    if (!r.url) continue;
    citations.push({
      url:         r.url,
      domain:      registrableDomain(r.url),
      title:       r.title || r.source || null,
      position:    i + 1,
      snippetText: r.snippet || null,
    });
  }

  // Concat all text-bearing fields. ai_overview can include text + markdown
  // blocks. We accept whatever the parser gave us.
  const textParts = [];
  if (aio.text) textParts.push(aio.text);
  if (aio.markdown) textParts.push(aio.markdown);
  for (const item of aio.items || []) {
    if (item.text) textParts.push(item.text);
    if (item.markdown) textParts.push(item.markdown);
  }
  return { citations, text: textParts.join("\n"), triggered: true };
}

export function citationsFromDataForSEO(raw) { return aioFromDataForSEO(raw).citations; }
export function responseTextFromDataForSEO(raw) { return aioFromDataForSEO(raw).text; }
