// app/lib/seo/ai-citations/scan.server.js
// Orchestrates a full AI Citations scan: for each active prompt, query each
// configured platform `runsPerPrompt` times. Persists AiCitationRun rows with
// extracted citations + brand-mention signals. Updates AiCitationScan summary
// when complete. Designed to run as a detached background promise from the
// route action, same pattern as job-processor.

import prisma from "../../../db.server.js";
import { queryClaude }   from "./claude-client.server.js";
import { queryChatGPT }  from "./openai-client.server.js";
import { queryGoogleAIO } from "./aio-client.server.js";
import {
  citationsFromAnthropic, citationsFromOpenAI, citationsFromDataForSEO,
  responseTextFromAnthropic, responseTextFromOpenAI, responseTextFromDataForSEO,
  detectBrand, registrableDomain,
} from "./extractors.server.js";
import { citationRate, shareOfVoice, topDomains } from "./stats.server.js";

const PLATFORMS = {
  claude:  { query: queryClaude,    extract: citationsFromAnthropic,  text: responseTextFromAnthropic },
  chatgpt: { query: queryChatGPT,   extract: citationsFromOpenAI,     text: responseTextFromOpenAI },
  // AI Overview from Google via DataForSEO. Skipped runIndex>0 internally —
  // SERP+AIO is deterministic enough per scrape that 3 runs would be redundant
  // (and we'd pay 3x DataForSEO scrapes for ~identical results). The scan
  // orchestrator below caps AIO runs to 1 even when runsPerPrompt > 1.
  aio:     { query: queryGoogleAIO, extract: citationsFromDataForSEO, text: responseTextFromDataForSEO },
};

export async function runCitationScan({ scanId, storeId }) {
  const startedAt = Date.now();
  console.log(`[AiCitations] scan ${scanId} starting for store ${storeId}`);

  const scan = await prisma.aiCitationScan.findUnique({ where: { id: scanId } });
  if (!scan) throw new Error(`Scan ${scanId} not found`);

  // Pull config + prompts. Brand config is mandatory — without it we can't tell
  // whether the LLM mentioned the merchant's brand.
  const [brandConfig, prompts] = await Promise.all([
    prisma.aiBrandConfig.findUnique({ where: { storeId } }),
    prisma.aiPrompt.findMany({ where: { storeId, status: "active" } }),
  ]);
  if (!brandConfig) {
    await prisma.aiCitationScan.update({ where: { id: scanId }, data: { status: "FAILED", errorMessage: "Brand config missing — set it before scanning", finishedAt: new Date() } });
    return;
  }
  if (prompts.length === 0) {
    await prisma.aiCitationScan.update({ where: { id: scanId }, data: { status: "FAILED", errorMessage: "No active prompts", finishedAt: new Date() } });
    return;
  }

  // Inflate JSON arrays from string columns.
  const config = {
    brandName:   brandConfig.brandName,
    aliases:     JSON.parse(brandConfig.aliases || "[]"),
    domains:     JSON.parse(brandConfig.domains || "[]").map(d => d.toLowerCase()),
    competitors: JSON.parse(brandConfig.competitors || "[]"),
  };
  const platforms = JSON.parse(scan.platforms || "[]").filter(p => PLATFORMS[p]);
  const R = scan.runsPerPrompt || 3;

  let totalRuns = 0;
  let totalCitations = 0;
  let brandMentionCount = 0;
  let totalCostCents = 0;

  // Sequential within each (prompt, platform, run) — keeps rate-limit risk low
  // and surfaces failures immediately rather than burying them in a Promise.all.
  for (const prompt of prompts) {
    for (const platform of platforms) {
      const { query, extract, text } = PLATFORMS[platform];
      // AIO results are deterministic per SERP scrape; 3 reruns would only
      // burn DataForSEO budget without adding statistical signal. Cap to 1.
      const platformRuns = platform === "aio" ? 1 : R;
      for (let runIndex = 0; runIndex < platformRuns; runIndex++) {
        // Cancel check between expensive calls.
        const live = await prisma.aiCitationScan.findUnique({ where: { id: scanId }, select: { status: true } });
        if (live?.status === "CANCELLED") {
          console.log(`[AiCitations] scan ${scanId} cancelled mid-run`);
          await prisma.aiCitationScan.update({ where: { id: scanId }, data: { status: "CANCELLED", finishedAt: new Date(), totalRuns, totalCitations, brandMentions: brandMentionCount, costCents: totalCostCents } });
          return;
        }

        try {
          const result = await query({ prompt: prompt.text });
          const responseText = text(result.rawResponse);
          const citations    = extract(result.rawResponse);
          const detect       = detectBrand(responseText, config, config.competitors);

          // Persist run + citations atomically.
          await prisma.$transaction(async (tx) => {
            const run = await tx.aiCitationRun.create({
              data: {
                scanId, promptId: prompt.id, platform, model: result.model,
                runIndex,
                rawResponse: result.rawResponse,
                responseText,
                brandMentioned: detect.mentioned,
                brandPosition:  detect.position,
                mentionCount:   detect.mentionCount,
                competitorsMentioned: JSON.stringify(detect.competitorsFound),
                costCents:    result.costCents || 0,
                durationMs:   result.durationMs,
              },
            });
            if (citations.length > 0) {
              await tx.aiCitation.createMany({
                data: citations.map(c => ({
                  runId:        run.id,
                  url:          c.url,
                  domain:       c.domain,
                  title:        c.title,
                  position:     c.position,
                  isBrandOwned: config.domains.some(d => c.domain.endsWith(d)),
                  snippetText:  c.snippetText,
                })),
              });
            }
          });

          totalRuns++;
          totalCitations += citations.length;
          if (detect.mentioned) brandMentionCount++;
          totalCostCents += result.costCents || 0;
        } catch (err) {
          // Persist the failure as a run row so we can audit + retry later.
          await prisma.aiCitationRun.create({
            data: {
              scanId, promptId: prompt.id, platform, model: null,
              runIndex,
              rawResponse: {},
              responseText: "",
              brandMentioned: false,
              errorMessage:   err.message.slice(0, 500),
            },
          }).catch(() => {});
          console.warn(`[AiCitations] ${platform} run failed for prompt "${prompt.text.slice(0, 40)}":`, err.message);
        }
      }
    }

    // Stamp lastRunAt on the prompt so the UI can show "ran 3 hours ago".
    await prisma.aiPrompt.update({ where: { id: prompt.id }, data: { lastRunAt: new Date() } });
  }

  // Final scan summary.
  await prisma.aiCitationScan.update({
    where: { id: scanId },
    data: {
      status:            "DONE",
      finishedAt:        new Date(),
      totalRuns,
      totalCitations,
      brandMentions:     brandMentionCount,
      brandCitationRate: totalRuns > 0 ? brandMentionCount / totalRuns : 0,
      costCents:         totalCostCents,
      promptCount:       prompts.length,
    },
  });
  console.log(`[AiCitations] scan ${scanId} done: ${totalRuns} runs, ${brandMentionCount}/${totalRuns} mentions, $${(totalCostCents / 100).toFixed(2)} spent in ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

// ─── Aggregation API used by the dashboard loader ────────────────────────────
export async function getScanResults(scanId) {
  const scan = await prisma.aiCitationScan.findUnique({
    where: { id: scanId },
    include: {
      runs: {
        include: { citations: true, prompt: { select: { text: true, intent: true } } },
        orderBy: { ranAt: "asc" },
      },
    },
  });
  if (!scan) return null;

  // Per-platform citation rate with bootstrap CI.
  const byPlatform = {};
  for (const run of scan.runs) {
    if (run.errorMessage) continue;
    byPlatform[run.platform] = byPlatform[run.platform] || [];
    byPlatform[run.platform].push(run);
  }
  const platformStats = {};
  for (const [platform, runs] of Object.entries(byPlatform)) {
    platformStats[platform] = citationRate(runs);
  }

  // Flat citation list for domain ranking.
  const allCitations = scan.runs.flatMap(r => r.citations);
  const top = topDomains(allCitations, 25);

  // Open-pool SoV from competitorsMentioned + brand mentions.
  const sovCounts = {};
  let brandMentions = 0;
  for (const run of scan.runs) {
    if (run.brandMentioned) {
      sovCounts[run.platform === "claude" ? "(your brand)" : "(your brand)"] =
        (sovCounts["(your brand)"] || 0) + run.mentionCount;
      brandMentions += run.mentionCount;
    }
    for (const comp of JSON.parse(run.competitorsMentioned || "[]")) {
      sovCounts[comp] = (sovCounts[comp] || 0) + 1;
    }
  }
  const sov = shareOfVoice(sovCounts);

  return { scan, platformStats, topDomains: top, shareOfVoice: sov, totalBrandMentions: brandMentions };
}
