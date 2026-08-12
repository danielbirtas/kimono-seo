// app/routes/api.ga4.js
// Kimono SEO #30 — GA4 AI Traffic Monitor API

import prisma from "../db.server.js";
import { getGa4AuthUrl, isGa4Connected, getGa4Settings, fetchAiTrafficData } from "../lib/seo/ga4-traffic.server.js";

export async function loader({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const url  = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30");

  const connected = await isGa4Connected(store.id);
  if (!connected) {
    const authUrl = getGa4AuthUrl(connection.shopDomain);
    return Response.json({ connected: false, authUrl });
  }

  const settings = await getGa4Settings(store.id);

  // Return connection info only (no data fetch on GET)
  return Response.json({
    connected: true,
    propertyId:   settings.property_id,
    propertyName: settings.property_name,
  });
}

export async function action({ request }) {
  const { requireAuth } = await import("../lib/auth/index.server.js");
  const { storeId, connection } = await requireAuth(request);
  if (!storeId) return Response.json({ error: "No active store" }, { status: 401 });
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  const body = await request.json();

  if (body.intent === "fetch_data") {
    try {
      const days = body.days || 30;
      const data = await fetchAiTrafficData(store.id, days);
      return Response.json({ success: true, data });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  if (body.intent === "disconnect") {
    try {
      await prisma.seoSetting.deleteMany({
        where: { storeId: store.id, key: { in: ["ga4_refresh_token", "ga4_access_token", "ga4_expires_at", "ga4_property_id", "ga4_property_name"] } },
      });
      return Response.json({ success: true });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: "Unknown intent" }, { status: 400 });
}
