// app/lib/seo/cluster-detector.server.js
// Sprint 5 — Cluster Split + Duplicate Product Detection
//
// Detects:
// 1. Large clusters (>30 products with same aiTag) → recommend split into sub-L3
// 2. Near-duplicate products (title similarity ≥0.85) → recommend merge to variants

import prisma from "../../db.server.js";
import { createAlert, autoResolveAlertsFor, ALERT_TYPES, ALERT_SEVERITY } from "./alerts.server.js";

const CLUSTER_SPLIT_THRESHOLD = 30;
const DUPLICATE_SIMILARITY    = 0.85;

// ─── TITLE SIMILARITY (Jaccard on 3-grams) ───
function trigrams(str) {
  const s = str.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const set = new Set();
  for (let i = 0; i <= s.length - 3; i++) set.add(s.slice(i, i + 3));
  return set;
}

function jaccardSimilarity(a, b) {
  const setA = trigrams(a);
  const setB = trigrams(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const g of setA) if (setB.has(g)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

// ─── CLUSTER SPLIT DETECTION ───
export async function detectLargeClusters(storeId) {
  // Group products by aiTag, count per tag
  const groups = await prisma.seoProduct.groupBy({
    by:    ["aiTag"],
    where: { storeId, aiTag: { not: null }, NOT: { aiTag: "" } },
    _count: { _all: true },
    having: { aiTag: { _count: { gte: CLUSTER_SPLIT_THRESHOLD } } },
    orderBy: { _count: { aiTag: "desc" } },
  });

  let alerts = 0;
  for (const g of groups) {
    const count = g._count._all;
    const tag   = g.aiTag;

    // Get sample titles for context
    const samples = await prisma.seoProduct.findMany({
      where:  { storeId, aiTag: tag },
      select: { productTitle: true },
      take:   5,
    });

    await createAlert({
      storeId,
      type:        ALERT_TYPES.CLUSTER_SPLIT,
      severity:    count > 100 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING,
      subjectKind: "cluster",
      subjectId:   tag,
      title:       `Large cluster: "${tag}" (${count} products)`,
      description: `Tag "${tag}" has ${count} products — consider splitting into sub-categories (L3) for better SEO targeting. Large clusters dilute keyword focus.`,
      metadata:    { tag, count, sampleTitles: samples.map(s => s.productTitle) },
    });
    alerts++;
  }

  return { clustersScanned: groups.length, alerts };
}

// ─── DUPLICATE PRODUCT DETECTION ───
export async function detectDuplicateProducts(storeId) {
  // Get products grouped by aiTag (only check within same tag for performance)
  const tags = await prisma.seoProduct.findMany({
    where:    { storeId, aiTag: { not: null }, NOT: { aiTag: "" } },
    distinct: ["aiTag"],
    select:   { aiTag: true },
  });

  let totalPairs = 0;
  let alerts = 0;

  for (const { aiTag } of tags) {
    const products = await prisma.seoProduct.findMany({
      where:  { storeId, aiTag },
      select: { productId: true, productTitle: true },
      take:   100, // cap per cluster for performance
    });

    if (products.length < 2) continue;

    // Compare all pairs within cluster
    for (let i = 0; i < products.length; i++) {
      for (let j = i + 1; j < products.length; j++) {
        totalPairs++;
        const sim = jaccardSimilarity(products[i].productTitle, products[j].productTitle);
        if (sim >= DUPLICATE_SIMILARITY) {
          await createAlert({
            storeId,
            type:        ALERT_TYPES.DUPLICATE,
            severity:    sim >= 0.95 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING,
            subjectKind: "product",
            subjectId:   products[i].productId,
            title:       `Near-duplicate: ${(sim * 100).toFixed(0)}% similarity`,
            description: `"${products[i].productTitle.slice(0, 80)}" and "${products[j].productTitle.slice(0, 80)}" are ${(sim * 100).toFixed(0)}% similar. Consider merging as Shopify variants.`,
            metadata: {
              productA: { id: products[i].productId, title: products[i].productTitle },
              productB: { id: products[j].productId, title: products[j].productTitle },
              similarity: sim,
            },
          });
          alerts++;
        }
      }
    }
  }

  return { tagsChecked: tags.length, pairsCompared: totalPairs, alerts };
}

// ─── RUN ALL DETECTORS ───
export async function runAllDetectors(storeId) {
  const clusters   = await detectLargeClusters(storeId).catch(e => ({ error: e.message }));
  const duplicates = await detectDuplicateProducts(storeId).catch(e => ({ error: e.message }));
  return { clusters, duplicates };
}
