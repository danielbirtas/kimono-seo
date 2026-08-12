// app/lib/seo/discovery-orchestrator.server.js
//
// Bridges the 5-source keyword discovery to the existing Enrich pipeline.
// Discovery produces candidate STRINGS — orchestrator persists them as
// SeoCandidate rows (with enrichedAt=null) so the existing Enrich job
// picks them up and fills DFS data (volume, KD, CPC, SERP features).
//
// Two entry points:
//  - discoverAndPersistForProduct(storeId, productId) — single product
//  - discoverAndPersistBatch(storeId, opts) — bulk over store (paginated)
//
// Cost-aware: AI Extract cache makes bulk runs cheap for similar-product
// clusters. For Vivimall 31k products, expected ~7k unique AI calls
// (rest cache hits via cluster sharing).

import prisma from "../../db.server.js";
import { discoverCandidatesForProduct, normalizeKeyword } from "./keyword-discovery.server.js";

// Persist discovery output as SeoCandidate rows. Existing rows with same
// (storeId, productId, keywordNorm) are skipped via the @@unique constraint
// — createMany + skipDuplicates handles this efficiently.
async function persistCandidates(storeId, product, discoveryResult) {
  if (discoveryResult.candidates.length === 0) return { inserted: 0, skipped: 0 };

  const rows = discoveryResult.candidates.map(c => ({
    storeId,
    productId:       product.productId,
    productTitle:    product.productTitle,
    keyword:         c.keyword,
    keywordNorm:     normalizeKeyword(c.keyword),
    discoverySource: c.source,
    // enrichedAt stays null — Enrich job fills DFS data later
  }));

  // Bulk insert, dedup via @@unique on (storeId, productId, keywordNorm)
  const res = await prisma.seoCandidate.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return { inserted: res.count, skipped: rows.length - res.count };
}

// Mark a product as discovery-attempted regardless of whether candidates
// were produced. Without this, products that legitimately yield 0 viable
// candidates (very short titles, all stop-words, etc.) get re-picked every
// batch and the job stalls at "remaining = N" forever.
async function markAttempted(storeId, productPkId) {
  await prisma.seoProduct.update({
    where: { id: productPkId },
    data:  { discoveryAttemptedAt: new Date() },
  }).catch(() => {});
}

export async function discoverAndPersistForProduct(storeId, productId, opts = {}) {
  const product = await prisma.seoProduct.findFirst({
    where: { storeId, productId },
    select: {
      id: true, productId: true, productTitle: true, aiTag: true, aiSub: true,
      // productType + vendor not in current schema — passing undefined is fine
    },
  });
  if (!product) return { error: "Product not found", productId };

  const t0 = Date.now();
  const discovery = await discoverCandidatesForProduct(storeId, product, opts);
  const persist   = await persistCandidates(storeId, product, discovery);
  await markAttempted(storeId, product.id);
  const ms = Date.now() - t0;

  return {
    productId:       product.productId,
    durationMs:      ms,
    discovered:      discovery.totalUnique,
    inserted:        persist.inserted,
    skippedExisting: persist.skipped,
    aiCacheSource:   discovery.aiCache?.source || "skipped",
    aiClusterHash:   discovery.aiCache?.hash,
    sourceCounts:    discovery.sourceCountsFinal,
    errors:          discovery.errors,
  };
}

// Bulk run: iterate products in pages. Designed to be invokable from a job
// processor + interruptible. Returns counters + last processed productId
// so the caller can resume.
export async function discoverAndPersistBatch(storeId, {
  batchSize = 50,
  maxBatches = 10,
  skipIfHasCandidates = true,
  onlyMissingDiscoverySource = true,
} = {}) {
  const stats = {
    productsProcessed: 0,
    candidatesInserted: 0,
    candidatesSkipped: 0,
    aiCacheHits: 0,
    aiCacheFresh: 0,
    errors: [],
    durationMs: 0,
  };

  const t0 = Date.now();

  for (let batch = 0; batch < maxBatches; batch++) {
    // Find products that need discovery. Selection is by SeoProduct.discoveryAttemptedAt
    // (set after each run, regardless of candidate count) — this is what prevents
    // products with 0 viable candidates from being re-picked every batch and
    // stalling progress.
    //
    // skipIfHasCandidates / onlyMissingDiscoverySource are kept as no-op opts
    // for caller compatibility; the new selection makes them redundant.
    const products = skipIfHasCandidates
      ? await prisma.seoProduct.findMany({
          where:  { storeId, discoveryAttemptedAt: null },
          select: { id: true, productId: true, productTitle: true, aiTag: true, aiSub: true },
          take:   batchSize,
        })
      : await prisma.seoProduct.findMany({
          where:  { storeId },
          select: { id: true, productId: true, productTitle: true, aiTag: true, aiSub: true },
          take:   batchSize,
          skip:   batch * batchSize,
        });

    if (products.length === 0) break;

    for (const product of products) {
      try {
        const discovery = await discoverCandidatesForProduct(storeId, product);
        const persist   = await persistCandidates(storeId, product, discovery);

        stats.candidatesInserted += persist.inserted;
        stats.candidatesSkipped  += persist.skipped;
        if (discovery.aiCache?.source === "cache_hit") stats.aiCacheHits++;
        if (discovery.aiCache?.source === "fresh")     stats.aiCacheFresh++;
        stats.productsProcessed++;
      } catch (e) {
        stats.errors.push({ productId: product.productId, message: e.message });
      } finally {
        // Always mark attempted — even on error or zero candidates — so the
        // selection loop above doesn't re-pick the same product next batch.
        await markAttempted(storeId, product.id);
      }
    }
  }

  stats.durationMs = Date.now() - t0;
  return stats;
}

// Re-export for convenience
export { discoverCandidatesForProduct } from "./keyword-discovery.server.js";
