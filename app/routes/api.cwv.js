// app/routes/api.cwv.js
import prisma from "../db.server.js";

export async function loader({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const { getCwvResults } = await import("../lib/seo/core-web-vitals.server.js");
  return Response.json({ data: await getCwvResults(store.id) });
}

export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const body = await request.json().catch(() => ({}));

  if (body.intent === "audit") {
    try {
      const { runCwvAudit } = await import("../lib/seo/core-web-vitals.server.js");
      const result = await runCwvAudit(store.id, connection.shopDomain);
      return Response.json({ success: true, ...result });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
