// app/routes/api.pinterest.scheduled-runner.js
// ═══ Pinterest Scheduled Pin Runner ═══
// HTTP-triggered worker. Picks up due ScheduledPin rows and posts them.
// Re-triggers itself if more pins are still due, else exits.
//
// Auth: X-Cron-Secret header (ENV: CRON_SECRET).
// Schedule: external pinger every 1-2 min (Railway cron / cron-job.org / etc.)
//   GET /api/pinterest/scheduled-runner

const RETRIGGER_DELAY_MS = 1000;
const BATCH_SIZE         = 20;

function selfTrigger() {
  const url    = `${process.env.SHOPIFY_APP_URL}/api/pinterest/scheduled-runner`;
  const secret = process.env.CRON_SECRET || "";
  setTimeout(() => {
    fetch(url, { method: "GET", headers: { "X-Cron-Secret": secret } }).catch(() => {});
  }, RETRIGGER_DELAY_MS);
}

export const loader = async ({ request }) => {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("X-Cron-Secret");
  if (!expected || expected !== provided) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { processDueScheduledPins } = await import("../lib/seo/pinterest-seo.server.js");
  const result = await processDueScheduledPins({ batchSize: BATCH_SIZE, maxAttempts: 3 });

  // If we hit the batch limit, more may be due — keep going
  if (result.processed >= BATCH_SIZE) selfTrigger();

  return Response.json({ ok: true, ...result, ts: new Date().toISOString() });
};
