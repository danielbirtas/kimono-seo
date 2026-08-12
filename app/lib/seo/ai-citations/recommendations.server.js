// app/lib/seo/ai-citations/recommendations.server.js
// Generates GEO content recommendations based on scan results. Anchored to the
// Princeton "GEO: Generative Engine Optimization" paper (Aggarwal/Murahari et al.,
// KDD 2024) — the only peer-reviewed evidence we have for what actually moves
// citation rates. The paper isolated 3 levers with statistically significant lift:
//   1. Cite credible third-party sources (.edu, .gov, papers)   → +30-40%
//   2. Add named-expert quotations                              → +28-30%
//   3. Add specific statistics, numbers, percentages, dates     → +30-41%
//
// We compute "lever gaps" by inspecting the response text of prompts where the
// brand was NOT cited, then ask Claude for a per-prompt recommendation that
// (a) lists which lever the cited competitors used, (b) suggests an editorial
// angle the brand could publish.

import prisma from "../../../db.server.js";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6";

// Cheap heuristic detectors. Used both to score each cited competitor's
// "lever profile" and to compute the merchant's gap.
const STAT_RE  = /\b\d+(?:[.,]\d+)?\s*(?:%|percent|x|×|million|thousand|usd|eur|ron|lei|\$|€)|\b\d{4}\b/gi;
const QUOTE_RE = /[""].{20,}?[""]|"\s*[^"]{20,}?\s*"/g;
const SOURCE_HINTS = [/\.edu\b/i, /\.gov\b/i, /according to (the )?(study|research|report|survey)/i, /(university|institute|journal|harvard|princeton|mit|stanford)/i];

function scoreLevers(text) {
  if (!text) return { statistics: 0, quotations: 0, sources: 0 };
  return {
    statistics: (text.match(STAT_RE) || []).length,
    quotations: (text.match(QUOTE_RE) || []).length,
    sources:    SOURCE_HINTS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0),
  };
}

export async function generateRecommendations(scanId) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const scan = await prisma.aiCitationScan.findUnique({
    where: { id: scanId },
    include: {
      store: { select: { id: true, shopDomain: true } },
      runs: { include: { prompt: { select: { id: true, text: true, intent: true } } }, orderBy: { ranAt: "asc" } },
    },
  });
  if (!scan) throw new Error("Scan not found");

  const brandConfig = await prisma.aiBrandConfig.findUnique({ where: { storeId: scan.storeId } });
  if (!brandConfig) throw new Error("Brand config not found");

  // Group runs by prompt — a recommendation is per-prompt, not per-run.
  const byPrompt = new Map();
  for (const run of scan.runs) {
    if (run.errorMessage) continue;
    const key = run.promptId;
    if (!byPrompt.has(key)) byPrompt.set(key, { prompt: run.prompt, runs: [] });
    byPrompt.get(key).runs.push(run);
  }

  // Identify prompts where the brand was mentioned in ZERO runs across all
  // platforms — those are the highest-leverage targets.
  const gaps = [];
  for (const { prompt, runs } of byPrompt.values()) {
    const mentions = runs.filter(r => r.brandMentioned).length;
    if (mentions === 0) {
      // Compute the average lever profile of the cited competitor answers.
      const leverScores = runs.map(r => scoreLevers(r.responseText));
      const avg = leverScores.reduce((acc, s) => ({
        statistics: acc.statistics + s.statistics,
        quotations: acc.quotations + s.quotations,
        sources:    acc.sources + s.sources,
      }), { statistics: 0, quotations: 0, sources: 0 });
      const N = Math.max(1, leverScores.length);
      gaps.push({
        promptId:  prompt.id,
        prompt:    prompt.text,
        intent:    prompt.intent,
        platforms: runs.map(r => r.platform),
        leverProfileAvg: {
          statistics: avg.statistics / N,
          quotations: avg.quotations / N,
          sources:    avg.sources / N,
        },
        sampleAnswer: runs[0]?.responseText?.slice(0, 800) || "",
      });
    }
  }

  if (gaps.length === 0) {
    return { recommendations: [], summary: "Brand-ul tău e citat pe TOATE prompts active. Niciun gap detectat. Continuă publishing-ul curent." };
  }

  // Sample up to 8 worst-performing prompts and ask Claude for one concrete
  // editorial recommendation per prompt. Batch in a single call to keep cost low.
  const sample = gaps.slice(0, 8);
  const systemPrompt = `You are a Generative Engine Optimization (GEO) consultant. The Princeton GEO paper isolated 3 statistically significant levers for LLM citation: (1) cite credible third-party sources, (2) add named-expert quotations, (3) include specific statistics with dates. For each prompt below, the merchant's brand was NOT mentioned by ChatGPT/Claude/Google AIO. Suggest ONE concrete piece of content the merchant could publish to win this prompt, anchored in the strongest lever for that intent. Output strict JSON array, no markdown, schema: [{"promptId": "...", "lever": "statistics|quotations|sources", "contentAngle": "...", "title": "...", "outline": "3-5 bullet points"}].`;

  const userPrompt = `Brand: ${brandConfig.brandName}
Domain(s): ${JSON.parse(brandConfig.domains || "[]").join(", ") || "(not configured)"}

Prompts where the brand is invisible:
${sample.map((g, i) => `\n[${i + 1}] promptId=${g.promptId}\nQ: ${g.prompt}\nIntent: ${g.intent || "unknown"}\nCompetitors used (avg per answer): ${g.leverProfileAvg.statistics.toFixed(1)} stats, ${g.leverProfileAvg.quotations.toFixed(1)} quotes, ${g.leverProfileAvg.sources.toFixed(1)} authoritative sources\nSample cited answer (truncated):\n${g.sampleAnswer.slice(0, 500)}`).join("\n\n")}

Return exactly ${sample.length} recommendations as a JSON array.`;

  const resp = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${await resp.text().catch(() => "")}`);
  const message = await resp.json();
  const text = (message.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```\s*$/, "").trim();
  let recommendations;
  try { recommendations = JSON.parse(cleaned); }
  catch { throw new Error("Claude returned unparseable JSON"); }
  if (!Array.isArray(recommendations)) throw new Error("Expected JSON array");

  return {
    recommendations,
    summary: `${gaps.length} prompts cu zero mentions detectate. ${sample.length} top-priority recomandări generate.`,
    gapCount: gaps.length,
    samplesAnalyzed: sample.length,
  };
}
