// app/routes/api.crawl-budget.js
import prisma from "../db.server.js";

export async function loader({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const { getCrawlBudgetResults } = await import("../lib/seo/crawl-budget.server.js");
  return Response.json({ data: await getCrawlBudgetResults(store.id) });
}

export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const body = await request.json().catch(() => ({}));

  if (body.intent === "audit") {
    try {
      const { runCrawlBudgetAudit } = await import("../lib/seo/crawl-budget.server.js");
      const result = await runCrawlBudgetAudit(store.id, connection.shopDomain);
      return Response.json({ success: true, ...result });
    } catch (e) {
      console.error("[Crawl Budget] audit error:", e.message);
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  if (body.intent === "apply_robots") {
    try {
      const { applyRobotsTxt } = await import("../lib/seo/crawl-budget.server.js");
      const result = await applyRobotsTxt(store.id, connection.shopDomain, body.rules || []);
      return Response.json({ success: true, ...result });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
