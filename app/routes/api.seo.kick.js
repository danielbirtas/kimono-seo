// app/routes/api.seo.kick.js
// Pipeline orchestrator. Called by cron every 15 min + fire-and-forget after webhooks.
// For each active store with pipelineMode=AUTO_PILOT:
//   - detect pending work (state-driven)
//   - queue ONE appropriate job respecting per-store cap (2)
// REVIEW_MANUAL stores: skipped (user queues manually from dashboard).

import prisma from "../db.server.js";

const MAX_ACTIVE_JOBS_PER_STORE = 2;

function triggerRunner() {
  const url    = `${process.env.APP_URL}/api/seo/job-runner`;
  const secret = process.env.CRON_SECRET || "";
  setTimeout(() => {
    fetch(url, { method: "GET", headers: { "X-Cron-Secret": secret } }).catch(() => {});
  }, 200);
}

export const loader = async ({ request }) => {
  const secret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("s") || "";
  if (secret !== (process.env.CRON_SECRET || "")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stores = await prisma.store.findMany({
    where:   { isActive: true },
    select:  { id: true, shopDomain: true },
  });

  const summary = [];
  let anyQueued = false;

  for (const store of stores) {
    const storeId = store.id;

    const settings = await prisma.storeSettings.findUnique({
      where:  { storeId },
      select: { pipelineMode: true, taxonomyAutoApply: true, taxonomyAutoMinVolume: true },
    });
    const mode = settings?.pipelineMode || "AUTO_PILOT";

    // Auto-apply eligible taxonomy proposals (runs regardless of pipeline mode,
    // since it acts on proposals user would otherwise manually approve)
    if (settings?.taxonomyAutoApply) {
      try {
        const { autoApplyProposalsForStore } = await import("../lib/seo/apply-proposal.server.js");
        const autoResult = await autoApplyProposalsForStore(storeId);
        if (autoResult.applied > 0 || autoResult.errors.length > 0) {
          summary.push({ storeId, autoApplied: autoResult.applied, autoErrors: autoResult.errors.length });
        }
      } catch (e) {
        console.error(`[kick] auto-apply failed for ${storeId}:`, e.message);
      }
    }

    if (mode !== "AUTO_PILOT") {
      summary.push({ storeId, skipped: "REVIEW_MANUAL" });
      continue;
    }

    const activeCount = await prisma.seoJob.count({
      where: { storeId, status: { in: ["QUEUED", "RUNNING"] } },
    });
    if (activeCount >= MAX_ACTIVE_JOBS_PER_STORE) {
      summary.push({ storeId, skipped: `${activeCount} joburi active` });
      continue;
    }

    // Pending work checks in priority order:
    // EXTRACT (candidates for new products) → ENRICH (DFS data) → TAG (AI classify + Shopify push) → TAXONOMY (tag → category proposals)
    const pendingJob = await detectPendingJob(storeId);
    if (!pendingJob) {
      summary.push({ storeId, status: "idle" });
      continue;
    }

    // Don't re-queue same type if already active
    const sameTypeActive = await prisma.seoJob.count({
      where: { storeId, type: pendingJob, status: { in: ["QUEUED", "RUNNING"] } },
    });
    if (sameTypeActive > 0) {
      summary.push({ storeId, skipped: `${pendingJob} deja în coadă` });
      continue;
    }

    await prisma.seoJob.create({
      data: { storeId, type: pendingJob, status: "QUEUED", statusMessage: `${pendingJob} kicked by orchestrator...` },
    });
    summary.push({ storeId, queued: pendingJob });
    anyQueued = true;
  }

  if (anyQueued) triggerRunner();

  return Response.json({ ok: true, timestamp: new Date().toISOString(), stores: summary.length, summary });
};

async function detectPendingJob(storeId) {
  // 1. EXTRACT — products without any candidate (raw SQL NOT EXISTS — O(1) memory)
  const missingCandidatesRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM "SeoProduct" p
    WHERE p."storeId" = ${storeId}
      AND p.status <> 'deleted'
      AND NOT EXISTS (
        SELECT 1 FROM "SeoCandidate" c
        WHERE c."storeId" = p."storeId" AND c."productId" = p."productId"
      )
  `;
  const missingCandidates = missingCandidatesRows?.[0]?.count || 0;
  if (missingCandidates > 0) return "EXTRACT";

  // 2. ENRICH — candidates without enrichedAt
  const unenriched = await prisma.seoCandidate.count({ where: { storeId, enrichedAt: null } });
  if (unenriched > 0) return "ENRICH";

  // 3. TAG — products with aiTag=null OR shopifyTagApplied=false
  const untagged = await prisma.seoProduct.count({
    where: {
      storeId,
      status: { not: "deleted" },
      OR: [{ aiTag: null }, { aiTag: "" }, { shopifyTagApplied: false, aiTag: { not: null } }],
    },
  });
  if (untagged > 0) return "TAG";

  // 4. TAXONOMY — aiTags not yet in proposals
  const distinctTags = await prisma.seoProduct.findMany({
    where: { storeId, aiTag: { not: null }, status: { not: "deleted" }, NOT: { aiTag: "" } },
    select: { aiTag: true },
    distinct: ["aiTag"],
  });
  const proposals = await prisma.seoTaxonomyProposal.findMany({
    where:  { storeId },
    select: { currentTag: true },
  });
  const proposedSet = new Set(proposals.map(p => p.currentTag));
  const newTags = distinctTags.filter(t => !proposedSet.has(t.aiTag));
  if (newTags.length > 0) return "TAXONOMY";

  return null;
}
