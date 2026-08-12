// app/routes/api.redirects.js
// Kimono SEO #05 — Redirect Manager API

import prisma from "../db.server.js";
import {
  scanForRedirects,
  applyRedirect,
  autoApplyHighConfidence,
  getRedirectSuggestions,
  dismissRedirect,
  getRedirectStats,
} from "../lib/seo/redirect-manager.server.js";

export async function loader({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "pending";

  const [suggestions, stats] = await Promise.all([
    getRedirectSuggestions(store.id, status),
    getRedirectStats(store.id),
  ]);

  return Response.json({ suggestions, stats });
}

export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const body = await request.json();
  const { intent } = body;

  if (intent === "scan") {
    try {
      const result = await scanForRedirects(store.id, connection.accessToken, connection.shopDomain);
      // Auto-apply high confidence after scan
      const autoResult = await autoApplyHighConfidence(store.id, connection.accessToken, connection.shopDomain);
      return Response.json({ success: true, ...result, autoApplied: autoResult.applied });
    } catch (err) {
      console.error("[Redirects] Scan error:", err);
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  if (intent === "apply") {
    try {
      const { suggestionId } = body;
      const result = await applyRedirect(store.id, suggestionId, connection.accessToken, connection.shopDomain);
      return Response.json({ success: true, ...result });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  if (intent === "apply_all") {
    try {
      const { threshold = 80 } = body;
      const result = await autoApplyHighConfidence(store.id, connection.accessToken, connection.shopDomain, threshold);
      return Response.json({ success: true, ...result });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  if (intent === "dismiss") {
    try {
      const { suggestionId } = body;
      await dismissRedirect(store.id, suggestionId);
      return Response.json({ success: true });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  if (intent === "dismiss_all") {
    try {
      const { ids } = body;
      await prisma.redirectSuggestion.updateMany({
        where: { storeId: store.id, id: { in: ids } },
        data: { status: "dismissed" },
      });
      return Response.json({ success: true, dismissed: ids.length });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  if (intent === "update_destination") {
    try {
      const { suggestionId, toPath } = body;
      await prisma.redirectSuggestion.update({
        where: { id: suggestionId },
        data: { toPath, confidence: 100 },
      });
      return Response.json({ success: true });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
