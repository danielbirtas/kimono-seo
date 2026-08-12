// app/routes/api.seo.job-status.js
// ═══ Kimono SEO — SEO Job Status + Queue ═══
// Single source of truth for job processing: api.seo.job-runner.js (cron + self-trigger)
// This route only CREATES jobs and fires the runner; it does NOT process in-process.

const MAX_ACTIVE_JOBS_PER_STORE = 2;

function triggerRunner() {
  const url    = `${process.env.APP_URL}/api/seo/job-runner`;
  const secret = process.env.CRON_SECRET || "";
  setTimeout(() => {
    fetch(url, { method: "GET", headers: { "X-Cron-Secret": secret } }).catch(() => {});
  }, 200);
}

// ─── GET: current job status ───
export const loader = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ job: null });

  const job = await prisma.seoJob.findFirst({
    where:   { storeId, status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { queuedAt: "desc" },
    select:  { id: true, type: true, status: true, totalItems: true, processedItems: true, progressPct: true, statusMessage: true, errorMessage: true },
  });

  const lastDone = job ? null : await prisma.seoJob.findFirst({
    where:   { storeId, status: "DONE" },
    orderBy: { finishedAt: "desc" },
    select:  { id: true, type: true, finishedAt: true, statusMessage: true },
  });

  return Response.json({ job, lastDone });
};

// ─── POST: queue job (processing handled by api.seo.job-runner.js) ───
export const action = async({ request }) => {
  const { default: prisma } = await import("../db.server.js");
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId } = await requireAuth(request);
  if (!storeId) return Response.json({ success: false, error: "No active store." }, { status: 400 });

  const body       = await request.json().catch(() => ({}));
  const { intent } = body;

  if (intent === "cancel") {
    await prisma.seoJob.updateMany({ where: { storeId, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });
    return Response.json({ success: true });
  }

  const typeMap = { sync: "SYNC", extract: "EXTRACT", enrich: "ENRICH", taxonomy: "TAXONOMY" };
  const jobType = typeMap[intent];
  if (!jobType) return Response.json({ success: false, error: "Unknown job type." }, { status: 400 });

  const activeCount = await prisma.seoJob.count({
    where: { storeId, status: { in: ["QUEUED", "RUNNING"] } },
  });
  if (activeCount >= MAX_ACTIVE_JOBS_PER_STORE) {
    return Response.json(
      { success: false, error: `Ai deja ${activeCount} joburi active. Așteaptă să se termine înainte să pornești altul.` },
      { status: 429 }
    );
  }

  await prisma.seoJob.updateMany({ where: { storeId, type: jobType, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED", finishedAt: new Date() } });

  if (intent === "sync") await prisma.seoSyncLog.create({ data: { storeId, status: "RUNNING" } });
  if (intent === "taxonomy") await prisma.seoTaxonomyProposal.deleteMany({ where: { storeId } });

  const job = await prisma.seoJob.create({ data: { storeId, type: jobType, status: "QUEUED", statusMessage: `${jobType} queued...` } });

  triggerRunner();

  return Response.json({ success: true, jobId: job.id, type: jobType });
};
