// app/routes/api.seo.audit-resume.js
// Zombie recovery for AUDIT jobs (in-process worker model — dies on PM2 reload).
// Called by cron every 15 min. Auth via X-Cron-Secret.

import prisma from "../db.server.js";

const STALE_MINUTES = 5;

export const loader = async ({ request }) => {
  const secret = request.headers.get("x-cron-secret") || "";
  if (secret !== (process.env.CRON_SECRET || "")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60_000);
  const zombies = await prisma.seoJob.findMany({
    where: {
      type:      "AUDIT",
      status:    "RUNNING",
      updatedAt: { lt: staleThreshold },
    },
    select: { id: true, storeId: true, processedItems: true, totalItems: true },
  });

  if (zombies.length === 0) return Response.json({ ok: true, resumed: 0 });

  const { processAuditInBackground } = await import("../lib/seo/audit-processor.server.js");
  const resumed = [];
  for (const z of zombies) {
    // Fire-and-forget — processor will skip already-audited products (idempotent)
    processAuditInBackground(z.id, z.storeId).catch((err) => {
      console.error(`[audit-resume] ${z.id} failed:`, err.message);
    });
    resumed.push({ jobId: z.id, storeId: z.storeId, processed: z.processedItems, total: z.totalItems });
  }

  return Response.json({ ok: true, resumed: resumed.length, details: resumed });
};
