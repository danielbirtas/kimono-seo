// app/lib/seo/job-processor.server.js
// Kimono SEO — Background Job Processor
// Runs as detached Promise from route actions.

import prisma from "../../db.server.js";

const SYNC_PAGE_SIZE = 100;
const EXTRACT_BATCH  = 20;
const ENRICH_BATCH   = 500;
const TAXONOMY_BATCH = 8;

export async function processJobInBackground(jobId, storeId, jobType) {
  await prisma.seoJob.update({
    where: { id: jobId },
    data:  { status: "RUNNING", startedAt: new Date() },
  });

  let done    = false;
  let retries = 0;
  let cursor  = null;

  while (!done && retries < 3) {
    try {
      let result;
      if      (jobType === "SYNC")     result = await processSyncBatch(jobId, storeId, cursor, SYNC_PAGE_SIZE);
      else if (jobType === "EXTRACT")  result = await processExtractBatch(storeId, EXTRACT_BATCH);
      else if (jobType === "ENRICH")   result = await processEnrichBatch(storeId, ENRICH_BATCH);
      else if (jobType === "TAXONOMY") result = await processTaxonomyBatch(storeId, TAXONOMY_BATCH);
      else if (jobType === "AUDIT")    result = await processAuditBatch(storeId);
      else if (jobType === "PAA_BATCH") result = await processPaaBatch(jobId, storeId);
      else throw new Error(`Unknown job type: ${jobType}`);

      cursor = result.cursor || null;

      await prisma.seoJob.update({
        where: { id: jobId },
        data: {
          processedItems: result.processed,
          totalItems:     result.total,
          progressPct:    result.total > 0 ? Math.round((result.processed / result.total) * 100) : 0,
          statusMessage:  result.message || "",
          cursor:         cursor || null,
        },
      });

      done    = result.done;
      retries = 0;
      if (!done) await sleep(300);
    } catch (err) {
      console.error(`[JobProcessor] ${jobType} error:`, err.message);
      retries++;
      if (retries >= 3) {
        await prisma.seoJob.update({
          where: { id: jobId },
          data:  { status: "FAILED", errorMessage: err.message, finishedAt: new Date() },
        });
        return;
      }
      await sleep(2000);
    }
  }

  await prisma.seoJob.update({
    where: { id: jobId },
    data:  { status: "DONE", progressPct: 100, statusMessage: "Complete.", finishedAt: new Date() },
  });
}

// ─── SYNC ───
async function processSyncBatch(jobId, storeId, cursor, pageSize) {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true } });
  if (!store) throw new Error("Store not found");

  const connection = await prisma.storeConnection.findFirst({
    where: { shopDomain: store.shopDomain, isActive: true }, orderBy: { connectedAt: "desc" },
  });
  if (!connection?.accessToken) throw new Error("No store connection found. Please connect your Shopify store first.");

  const job = await prisma.seoJob.findUnique({ where: { id: jobId }, select: { processedItems: true } });
  if ((job?.processedItems || 0) === 0 && !cursor) {
    await prisma.seoProduct.deleteMany({ where: { storeId } });
    await prisma.seoCandidate.deleteMany({ where: { storeId } });
  }

  const afterClause = cursor ? `, after: "${cursor}"` : "";
  const query = `{ products(first: ${pageSize}${afterClause}, query: "status:active") { edges { cursor node { id title } } pageInfo { hasNextPage } } }`;

  const resp = await fetch(`https://${store.shopDomain}/admin/api/2025-04/graphql.json`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": connection.accessToken },
    body:    JSON.stringify({ query }),
  });
  if (!resp.ok) throw new Error(`Shopify GraphQL ${resp.status}`);

  const data        = await resp.json();
  const edges       = data.data?.products?.edges || [];
  const hasNextPage = data.data?.products?.pageInfo?.hasNextPage || false;
  const nextCursor  = edges.length > 0 ? edges[edges.length - 1].cursor : null;

  if (edges.length > 0) {
    await prisma.$transaction(
      edges.map(({ node: p }) =>
        prisma.seoProduct.upsert({
          where:  { storeId_productId: { storeId, productId: p.id } },
          update: { productTitle: p.title, status: "pending" },
          create: { storeId, productId: p.id, productTitle: p.title, status: "pending" },
        })
      )
    );
  }

  const synced = await prisma.seoProduct.count({ where: { storeId } });
  if (!hasNextPage) {
    await prisma.seoSyncLog.updateMany({
      where: { storeId, status: "RUNNING" },
      data:  { status: "DONE", totalProducts: synced, finishedAt: new Date() },
    });
  }

  return {
    done:      !hasNextPage,
    processed: synced,
    total:     synced + (hasNextPage ? pageSize : 0),
    cursor:    nextCursor,
    message:   `Synced ${synced} products${hasNextPage ? "..." : "."}`,
  };
}

// ─── EXTRACT (Sprint F — SEO Brain 5-source pipeline) ───
async function processExtractBatch(storeId, batchSize) {
  const { discoverAndPersistBatch } = await import("./discovery-orchestrator.server.js");

  const totalProducts = await prisma.seoProduct.count({ where: { storeId } });
  if (totalProducts === 0) {
    return { done: true, processed: 0, total: 0, message: "No products in catalog yet." };
  }

  const stats = await discoverAndPersistBatch(storeId, {
    batchSize,
    maxBatches: 1,
  });

  const attempted = await prisma.seoProduct.count({
    where: { storeId, discoveryAttemptedAt: { not: null } },
  });

  const aiTotal    = stats.aiCacheHits + stats.aiCacheFresh;
  const cacheRate  = aiTotal > 0 ? Math.round((100 * stats.aiCacheHits) / aiTotal) : 0;
  const newCandStr = stats.candidatesInserted > 0 ? `+${stats.candidatesInserted} cand` : "no new cand";
  const cacheStr   = aiTotal > 0 ? `AI cache ${cacheRate}%` : "no AI calls";

  return {
    done:      attempted >= totalProducts,
    processed: attempted,
    total:     totalProducts,
    message:   `Brain discovery ${attempted}/${totalProducts} (5-source, ${newCandStr}, ${cacheStr})`,
  };
}

// ─── ENRICH ───
async function processEnrichBatch(storeId, batchSize) {
  const { enrichKeywords, hasDfsConfig } = await import("./dataforseo.server.js");
  const storeSettings = await prisma.storeSettings.findUnique({ where: { storeId } });
  const language      = storeSettings?.aiLanguage || "ro";

  if (!hasDfsConfig()) {
    await prisma.seoCandidate.updateMany({ where: { storeId, enrichedAt: null }, data: { enrichedAt: new Date(), score: 0, cacheHit: false } });
    const total = await prisma.seoCandidate.count({ where: { storeId } });
    return { done: true, processed: total, total, message: "DataForSEO not configured — skipped." };
  }

  const unenriched = await prisma.seoCandidate.findMany({ where: { storeId, enrichedAt: null }, select: { id: true, keyword: true, keywordNorm: true }, take: batchSize });
  if (unenriched.length === 0) {
    const total    = await prisma.seoCandidate.count({ where: { storeId } });
    const enriched = await prisma.seoCandidate.count({ where: { storeId, enrichedAt: { not: null } } });
    return { done: true, processed: enriched, total, message: `Enriched all ${total} candidates.` };
  }

  const keywords = [...new Set(unenriched.map((c) => c.keywordNorm))];
  const enriched = await enrichKeywords(keywords, language);

  for (const c of unenriched) {
    const data = enriched.get(c.keywordNorm);
    if (!data) continue;
    await prisma.seoCandidate.update({
      where: { id: c.id },
      data:  { volume: data.volume ?? 0, difficulty: data.difficulty ?? 0, cpc: data.cpc ?? 0, competition: data.competition ?? "LOW", serpFeatures: JSON.stringify(data.serpFeatures ?? []), paaCount: data.paaCount ?? 0, trend: JSON.stringify(data.trend ?? []), score: data.score ?? 0, enrichedAt: new Date(), cacheHit: data.fromCache ?? false },
    }).catch(() => {});
  }

  const total     = await prisma.seoCandidate.count({ where: { storeId } });
  const enriched2 = await prisma.seoCandidate.count({ where: { storeId, enrichedAt: { not: null } } });
  return { done: total - enriched2 === 0, processed: enriched2, total, message: `Enriched ${enriched2}/${total} candidates...` };
}

// ─── TAXONOMY ───
async function processTaxonomyBatch(storeId, batchSize) {
  const { makeTaxonomyDecisions } = await import("./taxonomy.server.js");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic API key not configured.");

  const storeSettings = await prisma.storeSettings.findUnique({ where: { storeId } });
  const language      = storeSettings?.aiLanguage || "ro";
  const model         = storeSettings?.aiModel    || process.env.AI_MODEL_QUALITY || "claude-sonnet-4-6";

  const allProducts = await prisma.seoProduct.findMany({
    where:  { storeId },
    select: { productId: true, productTitle: true },
  });

  if (allProducts.length === 0) {
    return { done: true, processed: 0, total: 0, message: "No products found." };
  }

  const doneProposals = await prisma.seoTaxonomyProposal.findMany({ where: { storeId }, select: { currentTag: true } });
  const doneSet       = new Set(doneProposals.map((r) => r.currentTag));

  const pending = allProducts
    .map((p) => ({ productId: p.productId, currentTag: p.productTitle.slice(0, 60) }))
    .filter((p) => !doneSet.has(p.currentTag));

  if (pending.length === 0) {
    const total = await prisma.seoTaxonomyProposal.count({ where: { storeId } });
    return { done: true, processed: total, total, message: `Generated ${total} proposals.` };
  }

  const batch      = pending.slice(0, batchSize);
  const tagBatches = await Promise.all(batch.map(async ({ productId, currentTag }) => {
    const candidates = await prisma.seoCandidate.findMany({
      where:   { storeId, productId, enrichedAt: { not: null } },
      orderBy: { score: "desc" },
      take:    15,
    });
    const kwMap = new Map();
    for (const c of candidates) {
      const ex = kwMap.get(c.keywordNorm);
      if (!ex || (c.score || 0) > (ex.score || 0)) kwMap.set(c.keywordNorm, c);
    }
    const variants = Array.from(kwMap.values()).slice(0, 10).map((c) => ({
      keyword: c.keyword, volume: c.volume || 0, score: c.score || 0,
      cpc: c.cpc || 0, competition: c.competition || "LOW",
      serpFeatures: JSON.parse(c.serpFeatures || "[]"), paaCount: c.paaCount || 0,
    }));
    return { currentTag, variants, affectedProductIds: [productId], affectedCount: 1 };
  }));

  const valid = tagBatches.filter((b) => b.variants.length > 0);
  if (valid.length === 0) {
    return { done: pending.length <= batchSize, processed: doneProposals.length, total: allProducts.length, message: "No enriched candidates for this batch yet." };
  }

  const decisions = await makeTaxonomyDecisions(apiKey, valid, language, model);

  const dedupMap = new Map();
  for (const d of decisions) {
    const key      = `${storeId}::${d.proposedHandle || d.proposedTag}`;
    const existing = dedupMap.get(key);
    if (!existing || (d.proposedVolume || 0) > (existing.proposedVolume || 0)) {
      dedupMap.set(key, d);
    }
  }

  for (const d of dedupMap.values()) {
    const handle   = d.proposedHandle || "";
    const existing = await prisma.seoTaxonomyProposal.findFirst({ where: { storeId, proposedHandle: handle } });
    if (existing) {
      if ((d.proposedVolume || 0) > (existing.proposedVolume || 0)) {
        await prisma.seoTaxonomyProposal.update({
          where: { id: existing.id },
          data:  { proposedTag: d.proposedTag, categoryL1: d.categoryL1 || "", categoryL2: d.categoryL2 || "", categoryL3: d.categoryL3 || null, currentVolume: d.currentVolume || 0, proposedVolume: d.proposedVolume || 0, justification: d.justification || "" },
        }).catch(() => {});
      }
    } else {
      await prisma.seoTaxonomyProposal.create({
        data: { storeId, currentTag: d.currentTag, proposedTag: d.proposedTag, proposedHandle: handle, categoryL1: d.categoryL1 || "", categoryL2: d.categoryL2 || "", categoryL3: d.categoryL3 || null, currentVolume: d.currentVolume || 0, proposedVolume: d.proposedVolume || 0, justification: d.justification || "", affectedProductIds: JSON.stringify(d.affectedProductIds || []), affectedCount: d.affectedCount || 0, status: "PENDING" },
      }).catch(() => {});
    }
  }

  const totalProposals    = await prisma.seoTaxonomyProposal.count({ where: { storeId } });
  const remaining         = pending.length - batch.length;
  const productsProcessed = allProducts.length - Math.max(0, remaining);
  return { done: remaining <= 0, processed: productsProcessed, total: allProducts.length, message: `${totalProposals} proposals, ${Math.max(0, remaining)} products remaining...` };
}

async function processAuditBatch(storeId) {
  const { runAuditBatch } = await import("./onpage-audit.server.js");

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true } });
  if (!store) throw new Error("Store not found");

  const connection = await prisma.storeConnection.findFirst({
    where: { shopDomain: store.shopDomain, isActive: true }, orderBy: { connectedAt: "desc" },
  });
  if (!connection?.accessToken) throw new Error("No store connection found. Please connect your Shopify store first.");

  return runAuditBatch(storeId, store.shopDomain, connection.accessToken);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── PAA Batch Processor ──────────────────────────────────────────────────────
async function processPaaBatch(jobId, storeId) {
  // Fetch all keywords for this store that need PAA
  const candidates = await prisma.seoCandidate.findMany({
    where:   { storeId, enrichedAt: { not: null } },
    orderBy: { score: "desc" },
    take:    100,
    select:  { id: true, keyword: true, paaCount: true },
  });

  const total = candidates.length;
  await prisma.seoJob.update({
    where: { id: jobId },
    data:  { totalItems: total, statusMessage: `Searching PAA for ${total} keywords...` },
  });

  let processed = 0;
  let found = 0;

  for (const candidate of candidates) {
    const kw = candidate.keyword;
    try {
      const { fetchPaaQuestions, hasDfsConfig } = await import("./faq-paa.server.js");

      let questions = [];
      if (hasDfsConfig()) {
        questions = await fetchPaaQuestions(kw, 2040, "ro");
      }

      if (questions.length > 0) {
        await prisma.seoCandidate.update({
          where: { id: candidate.id },
          data:  { paaCount: questions.length, paaData: JSON.stringify(questions) },
        });
        found++;
      }
    } catch (e) {
      console.warn(`[PAA Batch] Failed for "${kw}":`, e.message);
    }

    processed++;
    const pct = Math.round((processed / total) * 100);
    await prisma.seoJob.update({
      where: { id: jobId },
      data: {
        processedItems: processed,
        progressPct:    pct,
        statusMessage:  `${processed}/${total} — ${found} with PAA — "${kw}"`,
      },
    });

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  return { done: true, processed, found, total };
}
