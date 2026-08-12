// app/routes/api.seo.job-runner.js
// ═══ Kimono SEO — SEO Background Job Runner (self-triggering) ═══
// No external cron needed. After processing one batch, it re-triggers
// itself via fetch() until the job is done.
//
// Called by: api.seo.job-status.js (on job creation)
//            itself (re-triggers after each batch)
//
// Auth: X-Cron-Secret header (ENV: CRON_SECRET)

import prisma from "../db.server.js";

const SYNC_PAGE_SIZE  = 100;
const EXTRACT_BATCH   = 8;
const ENRICH_BATCH    = 500;
const TAXONOMY_BATCH  = 20;

// Re-trigger self after a short delay (ms)
const RETRIGGER_DELAY = 500;

function selfTrigger() {
  const url    = `${process.env.APP_URL}/api/seo/job-runner`;
  const secret = process.env.CRON_SECRET || "";
  // Fire and forget after RETRIGGER_DELAY
  setTimeout(() => {
    fetch(url, { method: "GET", headers: { "X-Cron-Secret": secret } }).catch(() => {});
  }, RETRIGGER_DELAY);
}

export const loader = async ({ request }) => {
  const secret = request.headers.get("X-Cron-Secret") || "";
  if (secret !== (process.env.CRON_SECRET || "")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Atomic claim: SKIP LOCKED + prefer QUEUED, pick stale RUNNING (zombie) after 5 min.
  // Two concurrent loaders will pick DIFFERENT jobs. No race window.
  const claimed = await prisma.$queryRaw`
    UPDATE "SeoJob"
    SET
      status      = 'RUNNING'::"JobStatus",
      "startedAt" = COALESCE("startedAt", NOW()),
      "updatedAt" = NOW()
    WHERE id = (
      SELECT id FROM "SeoJob"
      WHERE
        type IN ('SYNC'::"JobType", 'EXTRACT'::"JobType", 'ENRICH'::"JobType", 'TAG'::"JobType", 'TAXONOMY'::"JobType")
        AND (
          status = 'QUEUED'::"JobStatus"
          OR (status = 'RUNNING'::"JobStatus" AND "updatedAt" < NOW() - INTERVAL '5 minutes')
        )
      ORDER BY
        CASE WHEN status = 'QUEUED'::"JobStatus" THEN 0 ELSE 1 END,
        "queuedAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, "storeId", type::text AS type, status::text AS status,
              cursor, "processedItems", "retryCount", "totalItems", "progressPct";
  `;

  if (!claimed || claimed.length === 0) {
    return Response.json({ ok: true, message: "No jobs in queue." });
  }

  const job = claimed[0];
  const storeId = job.storeId;

  try {
    let result;
    switch (job.type) {
      case "SYNC":     result = await processSyncBatch(job, storeId);     break;
      case "EXTRACT":  result = await processExtractBatch(job, storeId);  break;
      case "ENRICH":   result = await processEnrichBatch(job, storeId);   break;
      case "TAG":      result = await processTagBatch(job, storeId);      break;
      case "TAXONOMY": result = await processTaxonomyBatch(job, storeId); break;
      default: throw new Error(`Unknown job type: ${job.type}`);
    }

    if (result.done) {
      await prisma.seoJob.update({
        where: { id: job.id },
        data: { status: "DONE", progressPct: 100, statusMessage: result.message || "Complete", finishedAt: new Date() },
      });
      // No re-trigger — job is done
    } else {
      await prisma.seoJob.update({
        where: { id: job.id },
        data: {
          status:         "RUNNING",
          processedItems: result.processed,
          totalItems:     result.total,
          progressPct:    result.total > 0 ? Math.round((result.processed / result.total) * 100) : 0,
          statusMessage:  result.message || "",
          cursor:         result.cursor  || null,
        },
      });
      // Re-trigger for next batch
      selfTrigger();
    }

    return Response.json({ ok: true, jobId: job.id, type: job.type, done: result.done });
  } catch (err) {
    console.error(`[JobRunner] ${job.type} failed:`, err);
    const retryCount = job.retryCount + 1;
    await prisma.seoJob.update({
      where: { id: job.id },
      data: {
        status:       retryCount >= 3 ? "FAILED" : "QUEUED",
        retryCount,
        errorMessage: err.message,
      },
    });
    // Retry unless max retries reached
    if (retryCount < 3) selfTrigger();
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
};

// ─── SYNC BATCH ───
async function processSyncBatch(job, storeId) {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true } });
  if (!store) throw new Error("Store not found");

  const session = await prisma.storeConnection.findFirst({
    where:   { shopDomain: store.shopDomain, isActive: true },
    orderBy: { connectedAt: "desc" },
  });
  if (!session?.accessToken) throw new Error("No store connection found. Please connect your Shopify store first.");

  const cursor  = job.cursor || null;
  const isFirst = !cursor && job.processedItems === 0;

  // Incremental SYNC: on first batch, compute lastSyncAt from prior DONE SeoSyncLog
  // (ignore the currently-running log). If none → sync everything active (baseline).
  // Full wipe/rebuild is done by /api/seo/resync-full BEFORE queuing SYNC.
  let shopifyQuery = "status:active";
  if (isFirst) {
    const lastSync = await prisma.seoSyncLog.findFirst({
      where:   { storeId, status: "DONE" },
      orderBy: { finishedAt: "desc" },
      select:  { finishedAt: true },
    });
    if (lastSync?.finishedAt) {
      const iso = lastSync.finishedAt.toISOString();
      shopifyQuery = `status:active updated_at:>'${iso}'`;
    }
  }

  const afterClause = cursor ? `, after: "${cursor}"` : "";
  const query = `{
    products(first: ${SYNC_PAGE_SIZE}${afterClause}, query: "${shopifyQuery}") {
      edges { cursor node { id title productType vendor tags updatedAt } }
      pageInfo { hasNextPage }
    }
  }`;

  const resp = await fetch(`https://${store.shopDomain}/admin/api/2025-04/graphql.json`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": session.accessToken },
    body:    JSON.stringify({ query }),
  });
  if (!resp.ok) throw new Error(`Shopify GraphQL ${resp.status}`);

  const data        = await resp.json();
  const edges       = data.data?.products?.edges || [];
  const hasNextPage = data.data?.products?.pageInfo?.hasNextPage || false;
  const nextCursor  = edges.length > 0 ? edges[edges.length - 1].cursor : null;

  if (edges.length > 0) {
    // Upsert preserving aiTag/status for already-processed products
    await prisma.$transaction(
      edges.map(({ node: p }) =>
        prisma.seoProduct.upsert({
          where:  { storeId_productId: { storeId, productId: p.id } },
          update: { productTitle: p.title },               // only title on update
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

  return { done: !hasNextPage, processed: synced, total: synced + (hasNextPage ? 1 : 0), cursor: nextCursor, message: `Synced ${synced} products${hasNextPage ? "..." : "."}` };
}

// ─── EXTRACT BATCH (Sprint F — SEO Brain 5-source pipeline) ───
// Înlocuiește legacy `extractCandidates` (1-source Anthropic) cu
// `discoverAndPersistBatch` din discovery-orchestrator: 5 surse paralele
// (AI normalized + pattern + synonym + GSC + cross-product) + SeoAiExtractCache
// (cross-store 98% cost savings) + Title Normalizer (pre-pass on stuffed titles).
//
// Progres: tracking prin SeoProduct.discoveryAttemptedAt — monotonic chiar dacă
// orchestratorul returnează 0 candidate pentru un produs (rezolvă bug-ul vechi
// de loop infinit pe titluri "imposibile").
async function processExtractBatch(job, storeId) {
  const { discoverAndPersistBatch } = await import("../lib/seo/discovery-orchestrator.server.js");

  const totalProducts = await prisma.seoProduct.count({ where: { storeId } });
  if (totalProducts === 0) {
    return { done: true, processed: 0, total: 0, message: "No products in catalog yet." };
  }

  const stats = await discoverAndPersistBatch(storeId, {
    batchSize:  EXTRACT_BATCH,
    maxBatches: 1,
  });

  const attempted = await prisma.seoProduct.count({
    where: { storeId, discoveryAttemptedAt: { not: null } },
  });

  const aiTotal     = stats.aiCacheHits + stats.aiCacheFresh;
  const cacheRate   = aiTotal > 0 ? Math.round((100 * stats.aiCacheHits) / aiTotal) : 0;
  const newCandStr  = stats.candidatesInserted > 0 ? `+${stats.candidatesInserted} cand` : "no new cand";
  const cacheStr    = aiTotal > 0 ? `AI cache ${cacheRate}%` : "no AI calls";

  return {
    done:      attempted >= totalProducts,
    processed: attempted,
    total:     totalProducts,
    message:   `Brain discovery ${attempted}/${totalProducts} (5-source, ${newCandStr}, ${cacheStr})`,
  };
}

// ─── ENRICH BATCH ───
async function processEnrichBatch(job, storeId) {
  const { enrichKeywords, hasDfsConfig } = await import("../lib/seo/dataforseo.server.js");
  const storeSettings = await prisma.storeSettings.findUnique({ where: { storeId } });
  const language      = storeSettings?.aiLanguage || "ro";

  if (!hasDfsConfig()) {
    await prisma.seoCandidate.updateMany({ where: { storeId, enrichedAt: null }, data: { enrichedAt: new Date(), score: 0, cacheHit: false } });
    const total = await prisma.seoCandidate.count({ where: { storeId } });
    return { done: true, processed: total, total, message: "DataForSEO not configured — skipped enrichment." };
  }

  const unenriched = await prisma.seoCandidate.findMany({ where: { storeId, enrichedAt: null }, select: { id: true, keyword: true, keywordNorm: true }, take: ENRICH_BATCH });
  if (unenriched.length === 0) {
    const total    = await prisma.seoCandidate.count({ where: { storeId } });
    const enriched = await prisma.seoCandidate.count({ where: { storeId, enrichedAt: { not: null } } });
    return { done: true, processed: enriched, total, message: `Enriched all ${total} candidates.` };
  }

  const keywords = [...new Set(unenriched.map((c) => c.keywordNorm))];
  const enriched = await enrichKeywords(keywords, language);

  for (const candidate of unenriched) {
    const data = enriched.get(candidate.keywordNorm);
    if (!data) continue;
    await prisma.seoCandidate.update({
      where: { id: candidate.id },
      data: { volume: data.volume ?? 0, difficulty: data.difficulty ?? 0, cpc: data.cpc ?? 0, competition: data.competition ?? "LOW", serpFeatures: JSON.stringify(data.serpFeatures ?? []), paaCount: data.paaCount ?? 0, trend: JSON.stringify(data.trend ?? []), score: data.score ?? 0, enrichedAt: new Date(), cacheHit: data.fromCache ?? false },
    }).catch(() => {});
  }

  const totalCandidates = await prisma.seoCandidate.count({ where: { storeId } });
  const enrichedTotal   = await prisma.seoCandidate.count({ where: { storeId, enrichedAt: { not: null } } });
  return { done: totalCandidates - enrichedTotal === 0, processed: enrichedTotal, total: totalCandidates, message: `Enriched ${enrichedTotal}/${totalCandidates} candidates...` };
}

// ─── TAG BATCH ───
const TAG_BATCH_SIZE = 50;
async function processTagBatch(job, storeId) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic API key not configured.");

  const total = await prisma.seoProduct.count({ where: { storeId } });

  // Get Shopify connection (same pattern as processSyncBatch)
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true } });
  const session = store ? await prisma.storeConnection.findFirst({
    where: { shopDomain: store.shopDomain, isActive: true },
    orderBy: { connectedAt: "desc" },
  }) : null;
  const shopDomain  = store?.shopDomain;
  const accessToken = session?.accessToken;

  // Step 1: push already-tagged products to Shopify (backfill + normal flow)
  const toApplyRaw = await prisma.seoProduct.findMany({
    where:  { storeId, shopifyTagApplied: false },
    take:   TAG_BATCH_SIZE,
    select: { id: true, productId: true, aiTag: true, aiSub: true },
  });
  const toApply = toApplyRaw.filter(r => r.aiTag && r.aiTag.trim() !== "");

  if (toApply.length > 0) {
    // Preload APPLIED taxonomy proposals for this store — avoids N+1 per product
    const appliedProposals = await prisma.seoTaxonomyProposal.findMany({
      where:  { storeId, status: "APPLIED" },
      select: { currentTag: true, proposedTag: true, categoryL1: true },
    });
    const proposalMap = new Map();
    for (const p of appliedProposals) proposalMap.set(p.currentTag, p);

    let pushed = 0;
    if (accessToken && shopDomain) {
      for (const row of toApply) {
        const tags = [row.aiTag.replace(/-/g, " ")];
        if (row.aiSub && row.aiSub.toLowerCase().replace(/\s+/g, "-") !== row.aiTag) tags.push(row.aiSub);

        // Propagate APPLIED taxonomy tags (ensures new products inherit approved collections)
        const proposal = proposalMap.get(row.aiTag);
        if (proposal) {
          const proposedSlug = proposal.proposedTag.toLowerCase().replace(/\s+/g, "-");
          if (!tags.includes(proposedSlug)) tags.push(proposedSlug);
          if (proposal.categoryL1) {
            const cat1Slug = proposal.categoryL1.toLowerCase().replace(/\s+/g, "-");
            if (!tags.includes(cat1Slug)) tags.push(cat1Slug);
          }
        }

        try {
          const r = await fetch("https://" + shopDomain + "/admin/api/2025-04/graphql.json", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
            body: JSON.stringify({
              query: "mutation addTags($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }",
              variables: { id: row.productId, tags },
            }),
          });
          if (r.ok) pushed++;
        } catch (e) {
          console.warn("[TAG] Shopify push failed:", row.productId, e.message);
        }
      }
    }
    await prisma.seoProduct.updateMany({
      where: { id: { in: toApply.map(r => r.id) } },
      data:  { shopifyTagApplied: true, status: "done" },
    });
    const applied   = await prisma.seoProduct.count({ where: { storeId, shopifyTagApplied: true } });
    const remaining = total - applied;
    return { done: remaining === 0, processed: applied, total, message: "Applied " + applied + "/" + total + " tags to Shopify (" + pushed + " pushed this batch)..." };
  }

  // Step 2: AI tag for untagged products
  const storeSettings = await prisma.storeSettings.findUnique({ where: { storeId } });
  const model = storeSettings?.aiModel || process.env.AI_MODEL_FAST || "claude-haiku-4-5-20251001";

  const rows = await prisma.seoProduct.findMany({
    where:   { storeId, OR: [{ aiTag: null }, { aiTag: "" }] },
    orderBy: { createdAt: "asc" },
    take:    TAG_BATCH_SIZE,
    select:  { id: true, productId: true, productTitle: true },
  });

  if (rows.length === 0) {
    const applied = await prisma.seoProduct.count({ where: { storeId, shopifyTagApplied: true } });
    return { done: true, processed: applied, total, message: "All " + total + " products tagged and applied to Shopify." };
  }

  const lines = rows.map((p, i) => String(i + 1) + ". ID: " + p.productId + " | Titlu: \"" + p.productTitle.substring(0, 120) + "\"");
  const prompt = "Categorizeaza aceste produse Shopify pentru SEO. Atribuie un tag principal (categoria) si un subtag (subcategoria).\n\nPRODUSE:\n" + lines.join("\n") + "\n\nREGULI tag:\n- lowercase, fara diacritice, cu cratime (ex: \"tigai-fonta\")\n- 1-3 cuvinte, categoria produsului\n- NU include brand, marime, culoare\n- Grupeaza produse SIMILARE sub ACELASI tag\n\nReturneaza STRICT JSON array:\n[{\"id\":1,\"tag\":\"tigai-fonta\",\"sub\":\"inductie\"}]\n\nDOAR JSON valid.";

  const { anthropicMessage } = await import("../lib/anthropic.server.js");
  const { content: rawContent } = await anthropicMessage(
    { model, max_tokens: 700, system: "Expert categorizare produse e-commerce Romania. Raspunzi DOAR cu JSON valid, fara markdown.", messages: [{ role: "user", content: prompt }] },
    { apiKey }
  );
  const content = (rawContent || "[]").trim().replace(/```json\s*/g, "").replace(/```/g, "").trim();
  const match   = content.match(/\[[\s\S]*\]/);
  let aiTags = [];
  if (match) { try { aiTags = JSON.parse(match[0]); } catch {} }

  const matched = new Set();
  for (const td of aiTags) {
    const idx = (parseInt(td.id, 10) || 1) - 1;
    if (idx < 0 || idx >= rows.length) continue;
    const row = rows[idx];
    const tag = (td.tag || "").toLowerCase().replace(/[^a-z0-9-]/g, "").substring(0, 255);
    if (!tag) continue;
    await prisma.seoProduct.update({ where: { id: row.id }, data: { aiTag: tag, aiSub: (td.sub || "").substring(0, 255) } }).catch(() => {});
    matched.add(row.id);
  }

  const unmatched = rows.filter(r => !matched.has(r.id));
  for (const r of unmatched) {
    const fallback = r.productTitle.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).slice(0, 3).join("-").substring(0, 100);
    await prisma.seoProduct.update({ where: { id: r.id }, data: { aiTag: fallback || "produs" } }).catch(() => {});
  }

  const tagged = await prisma.seoProduct.count({ where: { storeId, aiTag: { not: null }, NOT: { aiTag: "" } } });
  return { done: false, processed: tagged, total, message: "Tagged " + tagged + "/" + total + " products (pushing to Shopify next)..." };
}


// ─── TAXONOMY BATCH ───
async function processTaxonomyBatch(job, storeId) {
  const { makeTaxonomyDecisions } = await import("../lib/seo/taxonomy.server.js");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic API key not configured.");

  const storeSettings = await prisma.storeSettings.findUnique({ where: { storeId } });
  const language      = storeSettings?.aiLanguage || "ro";
  const model         = storeSettings?.aiModel    || "claude-haiku-4-5-20251001";

  const processedTags = await prisma.seoTaxonomyProposal.findMany({ where: { storeId }, select: { currentTag: true } });
  const processedSet  = new Set(processedTags.map((r) => r.currentTag));
  const tagRows       = await prisma.seoProduct.findMany({ where: { storeId, aiTag: { not: null }, NOT: { aiTag: "" } }, distinct: ["aiTag"], select: { aiTag: true } });
  const pendingTags   = tagRows.map((r) => r.aiTag).filter((t) => t && !processedSet.has(t));

  if (pendingTags.length === 0) {
    const total = await prisma.seoTaxonomyProposal.count({ where: { storeId } });
    return { done: true, processed: total, total, message: `Generated ${total} taxonomy proposals.` };
  }

  const batch      = pendingTags.slice(0, TAXONOMY_BATCH);
  const tagBatches = await Promise.all(batch.map(async (currentTag) => {
    const products   = await prisma.seoProduct.findMany({ where: { storeId, aiTag: currentTag }, select: { productId: true } });
    const productIds = products.map((p) => p.productId);
    const candidates = await prisma.seoCandidate.findMany({ where: { storeId, productId: { in: productIds }, enrichedAt: { not: null } }, orderBy: { score: "desc" }, take: 20 });
    const kwMap = new Map();
    for (const c of candidates) { const ex = kwMap.get(c.keywordNorm); if (!ex || (c.score || 0) > (ex.score || 0)) kwMap.set(c.keywordNorm, c); }
    const variants = Array.from(kwMap.values()).slice(0, 10).map((c) => ({ keyword: c.keyword, volume: c.volume || 0, score: c.score || 0, cpc: c.cpc || 0, competition: c.competition || "LOW", serpFeatures: JSON.parse(c.serpFeatures || "[]"), paaCount: c.paaCount || 0 }));
    return { currentTag, variants, affectedProductIds: productIds, affectedCount: productIds.length };
  }));

  const validBatches = tagBatches.filter((b) => b.variants.length > 0);
  if (validBatches.length > 0) {
    const decisions = await makeTaxonomyDecisions(apiKey, validBatches, language, model);
    for (const d of decisions) {
      await prisma.seoTaxonomyProposal.create({
        data: { storeId, currentTag: d.currentTag, proposedTag: d.proposedTag, proposedHandle: d.proposedHandle, categoryL1: d.categoryL1 || "", categoryL2: d.categoryL2 || "", categoryL3: d.categoryL3 || null, currentVolume: d.currentVolume || 0, proposedVolume: d.proposedVolume || 0, justification: d.justification || "", affectedProductIds: JSON.stringify(d.affectedProductIds || []), affectedCount: d.affectedCount || 0, status: "PENDING" },
      }).catch(() => {});
    }
  }

  const totalProposals = await prisma.seoTaxonomyProposal.count({ where: { storeId } });
  const remaining      = pendingTags.length - batch.length;
  return { done: remaining <= 0, processed: totalProposals, total: tagRows.length, message: `${totalProposals} proposals, ${Math.max(0, remaining)} tags remaining...` };
}
