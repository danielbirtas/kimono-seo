// app/lib/seo/keyword-selector.server.js
// Sprint 4 — Anti-Cannibalization Keyword Allocator
//
// Greedy algorithm: sort all (product, candidate, ECS) tuples by ECS desc,
// allocate each keyword to at most 1 product. Products without a unique
// keyword get flagged as "collection-only".

import prisma from "../../db.server.js";
import { scoreAllCandidatesForProduct } from "./ecs-scorer.server.js";
import { logDecision, DECISION_KINDS } from "./decision-log.server.js";
import { createAlert, ALERT_TYPES, ALERT_SEVERITY } from "./alerts.server.js";

// ─── FULL STORE ALLOCATION ───
// Returns { allocated: Map<productId, assignment>, unassigned: string[], stats }
export async function selectKeywordsForStore(storeId, { batchSize = 50, offset = 0 } = {}) {
  // Get products with enriched candidates
  const products = await prisma.seoProduct.findMany({
    where: { storeId, aiTag: { not: null }, NOT: { aiTag: "" } },
    select: { productId: true, productTitle: true },
    skip: offset,
    take: batchSize,
  });

  if (products.length === 0) return { allocated: new Map(), unassigned: [], stats: { scored: 0, allocated: 0, collectionOnly: 0 }, done: true };

  // Get taxonomy-level keywords (L1/L2/L3) — these are owned by collections, not products
  const proposals = await prisma.seoTaxonomyProposal.findMany({
    where: { storeId, status: { in: ["APPROVED", "APPLIED"] } },
    select: { categoryL1: true, categoryL2: true, categoryL3: true },
  });
  const reservedKeywords = new Set();
  for (const p of proposals) {
    if (p.categoryL1) reservedKeywords.add(p.categoryL1.toLowerCase().trim());
    if (p.categoryL2) reservedKeywords.add(p.categoryL2.toLowerCase().trim());
    if (p.categoryL3) reservedKeywords.add(p.categoryL3.toLowerCase().trim());
  }

  // Already-allocated keywords from previous batches
  const alreadyAllocated = await prisma.seoCandidate.findMany({
    where: { storeId, ecsAllocated: true },
    select: { keywordNorm: true },
  });
  const takenKeywords = new Set(alreadyAllocated.map(c => c.keywordNorm));

  // Score all candidates for each product
  const allTuples = [];
  for (const product of products) {
    const scored = await scoreAllCandidatesForProduct(storeId, product.productId);
    for (const s of scored) {
      if (s.ecs <= 0) continue; // filtered out (informational, no volume)
      allTuples.push({
        productId:    product.productId,
        productTitle: product.productTitle,
        ...s,
      });
    }
  }

  // Persist ECS scores
  for (const t of allTuples) {
    await prisma.seoCandidate.update({
      where: { id: t.candidateId },
      data: { ecsScore: t.ecs, ecsPosition: t.realisticPos },
    }).catch(() => {});
  }

  // Sort globally by ECS descending
  allTuples.sort((a, b) => b.ecs - a.ecs);

  // Greedy allocation
  const allocated = new Map(); // productId → assignment
  const productDone = new Set();

  for (const tuple of allTuples) {
    if (productDone.has(tuple.productId)) continue;
    const kwNorm = tuple.keywordNorm;

    // Skip if keyword is taxonomy-level (owned by collection)
    if (reservedKeywords.has(kwNorm)) continue;

    // Skip if keyword already taken by another product
    if (takenKeywords.has(kwNorm)) continue;

    // Allocate
    takenKeywords.add(kwNorm);
    productDone.add(tuple.productId);
    allocated.set(tuple.productId, {
      candidateId:  tuple.candidateId,
      keyword:      tuple.keyword,
      keywordNorm:  kwNorm,
      ecs:          tuple.ecs,
      volume:       tuple.volume,
      gscPosition:  tuple.gscPosition,
      realisticPos: tuple.realisticPos,
    });

    // Mark as allocated in DB
    await prisma.seoCandidate.update({
      where: { id: tuple.candidateId },
      data:  { ecsAllocated: true },
    }).catch(() => {});

    // Log decision
    const alternatives = allTuples
      .filter(t => t.productId === tuple.productId && t.candidateId !== tuple.candidateId)
      .slice(0, 5)
      .map(t => ({ keyword: t.keyword, ecs: t.ecs, volume: t.volume }));

    await logDecision({
      storeId,
      decisionKind: DECISION_KINDS.PRODUCT_KEYWORD,
      subjectKind:  "product",
      subjectId:    tuple.productId,
      inputs:  { candidateCount: allTuples.filter(t => t.productId === tuple.productId).length, gscPosition: tuple.gscPosition },
      output:  { keyword: tuple.keyword, ecs: tuple.ecs, volume: tuple.volume, realisticPos: tuple.realisticPos },
      rationale: `Selected "${tuple.keyword}" (ECS ${tuple.ecs}, vol ${tuple.volume}, pos ${tuple.gscPosition || "n/a"}→${tuple.realisticPos}). ${alternatives.length} alternatives considered.`,
    }).catch(() => {});
  }

  // Unassigned products — flag as collection-only
  const unassigned = [];
  for (const product of products) {
    if (!allocated.has(product.productId)) {
      unassigned.push(product.productId);
    }
  }

  return {
    allocated,
    unassigned,
    stats: {
      scored: allTuples.length,
      allocated: allocated.size,
      collectionOnly: unassigned.length,
    },
    done: products.length < batchSize,
  };
}

// ─── SINGLE PRODUCT KEYWORD SELECTION ───
export async function selectKeywordForProduct(storeId, productId, takenKeywords = new Set()) {
  const scored = await scoreAllCandidatesForProduct(storeId, productId);
  if (scored.length === 0) return null;

  for (const s of scored) {
    if (s.ecs <= 0) continue;
    if (takenKeywords.has(s.keywordNorm)) continue;
    return {
      candidateId: s.candidateId,
      keyword:     s.keyword,
      keywordNorm: s.keywordNorm,
      ecs:         s.ecs,
      volume:      s.volume,
      gscPosition: s.gscPosition,
      realisticPos: s.realisticPos,
    };
  }
  return null;
}
