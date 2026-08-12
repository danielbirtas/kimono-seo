// app/routes/api.paa.batch.js
// Kimono SEO — PAA Batch Job API

import prisma from "../db.server.js";

export async function loader({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  // Return active PAA_BATCH job if any
  const job = await prisma.seoJob.findFirst({
    where: {
      storeId: store.id,
      type:    "PAA_BATCH",
      status:  { in: ["QUEUED", "RUNNING"] },
    },
    orderBy: { queuedAt: "desc" },
    select: {
      id: true, status: true, progressPct: true,
      processedItems: true, totalItems: true, statusMessage: true,
    },
  });

  return Response.json({ job });
}

export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const body = await request.json();

  if (body.intent === "start") {
    // Cancel any existing PAA_BATCH jobs
    await prisma.seoJob.updateMany({
      where:  { storeId: store.id, type: "PAA_BATCH", status: { in: ["QUEUED", "RUNNING"] } },
      data:   { status: "CANCELLED" },
    });

    const job = await prisma.seoJob.create({
      data: { storeId: store.id, type: "PAA_BATCH", status: "QUEUED", statusMessage: "PAA batch queued..." },
    });

    const { processJobInBackground } = await import("../lib/seo/job-processor.server.js");
    processJobInBackground(job.id, store.id, "PAA_BATCH").catch(err =>
      console.error("[PAA Batch] unhandled error:", err)
    );

    return Response.json({ success: true, jobId: job.id });
  }

  if (body.intent === "status") {
    const job = await prisma.seoJob.findFirst({
      where:   { storeId: store.id, type: "PAA_BATCH" },
      orderBy: { queuedAt: "desc" },
      select: {
        id: true, status: true, progressPct: true,
        processedItems: true, totalItems: true, statusMessage: true,
        finishedAt: true,
      },
    });
    return Response.json({ job });
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
