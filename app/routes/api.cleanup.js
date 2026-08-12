// app/routes/api.cleanup.js
// Periodic cleanup of records that should TTL — called by the external cron
// workflow (.github/workflows/cron-schedulers.yml). Same X-Cron-Secret guard
// pattern as the other runners.
//
// Deletes:
//   - WebhookDedupe rows older than 7 days (Shopify's retry window)
//   - Session rows whose `expires` is in the past (Shopify-managed offline
//     sessions; some are kept indefinitely so we ONLY drop ones explicitly
//     marked expired, never speculative cleanup)

import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("X-Cron-Secret");
  if (!expected || expected !== provided) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoffDedupe = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dedupeDeleted = await prisma.webhookDedupe.deleteMany({
    where: { processedAt: { lt: cutoffDedupe } },
  });

  const sessionsDeleted = await prisma.session.deleteMany({
    where: { expires: { lt: new Date() } },
  });

  console.log(`[Cleanup] dedupe rows removed: ${dedupeDeleted.count}, expired sessions removed: ${sessionsDeleted.count}`);

  return Response.json({
    ok: true,
    dedupeRowsRemoved:    dedupeDeleted.count,
    sessionsRowsRemoved:  sessionsDeleted.count,
  });
};
