// app/routes/api.robots.js
// Kimono SEO #33 — Robots.txt AI Crawlers Audit API

import prisma from "../db.server.js";
import { auditRobotsTxt, saveAuditResult, getAuditResult } from "../lib/seo/robots-audit.server.js";

export async function loader({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const result = await getAuditResult(store.id);
  return Response.json({ result });
}

export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const body = await request.json();

  if (body.intent === "audit") {
    try {
      const result = await auditRobotsTxt(connection.shopDomain);
      await saveAuditResult(store.id, result);
      return Response.json({ success: true, result });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
