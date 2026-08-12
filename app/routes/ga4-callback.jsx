// app/routes/ga4-callback.jsx
// Kimono SEO #30 — GA4 OAuth2 Callback (public route)

import { useLoaderData } from "react-router";
import prisma from "../db.server.js";
import { exchangeGa4Code, listGa4Properties, saveGa4Tokens } from "../lib/seo/ga4-traffic.server.js";

function getAppBaseUrl() {
  // Self-hosted: return the app's own base URL (mirrors gsc-callback.jsx).
  return process.env.APP_URL || "http://localhost:3000";
}

export const loader = async ({ request }) => {
  const url   = new URL(request.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  let shopDomain = "";
  try {
    // Try base64url first (new format), then regular base64 (old format)
    shopDomain = Buffer.from(state || "", "base64url").toString("utf8");
    if (!shopDomain.includes(".")) {
      // Fallback to standard base64
      shopDomain = Buffer.from(decodeURIComponent(state || ""), "base64").toString("utf8");
    }
    // Validate looks like a domain
    if (!shopDomain.includes(".")) shopDomain = "";
  } catch { shopDomain = ""; }
  if (!shopDomain) return { status: "error", message: "Invalid state parameter. Please try connecting again.", appBaseUrl: "" };

  const appBaseUrl = getAppBaseUrl(shopDomain);
  if (error) return { status: "error", message: `Google returned: ${error}`, appBaseUrl };
  if (!code)  return { status: "error", message: "No authorization code received.", appBaseUrl };

  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) return { status: "error", message: "Store not found.", appBaseUrl };

  try {
    const { accessToken, refreshToken, expiresAt } = await exchangeGa4Code(code, shopDomain);

    let properties = [];
    try { properties = await listGa4Properties(accessToken); } catch {}

    if (properties.length === 0) {
      await saveGa4Tokens(store.id, { accessToken, refreshToken, expiresAt });
      return { status: "no_properties", appBaseUrl, message: "Connected, but no GA4 properties found. Make sure you have a GA4 property set up." };
    }

    if (properties.length === 1) {
      await saveGa4Tokens(store.id, { accessToken, refreshToken, expiresAt, propertyId: properties[0].id, propertyName: properties[0].name });
      return { status: "success", property: properties[0], appBaseUrl };
    }

    // Multiple properties — save tokens, let user pick
    await saveGa4Tokens(store.id, { accessToken, refreshToken, expiresAt });
    return { status: "pick_property", properties, storeId: store.id, appBaseUrl };

  } catch (err) {
    if (err.message?.includes("invalid_grant")) return { status: "success_cached", appBaseUrl };
    return { status: "error", message: err.message, appBaseUrl };
  }
};

export const action = async ({ request }) => {
  const formData    = await request.formData();
  const propertyId  = formData.get("propertyId");
  const propertyName = formData.get("propertyName");
  const storeId     = formData.get("storeId");
  const appBaseUrl  = formData.get("appBaseUrl");

  if (!propertyId || !storeId) return { status: "error", message: "Missing data.", appBaseUrl };

  await prisma.seoSetting.upsert({ where: { storeId_key: { storeId, key: "ga4_property_id" } }, create: { storeId, key: "ga4_property_id", value: propertyId }, update: { value: propertyId } });
  await prisma.seoSetting.upsert({ where: { storeId_key: { storeId, key: "ga4_property_name" } }, create: { storeId, key: "ga4_property_name", value: propertyName || propertyId }, update: { value: propertyName || propertyId } });

  return { status: "success", property: { id: propertyId, name: propertyName }, appBaseUrl };
};

// ── Styles (same as gsc-callback) ──
const pageStyle = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f4f7", fontFamily: "system-ui, sans-serif", padding: "20px" };
const cardStyle = { background: "#fff", borderRadius: "16px", padding: "48px 40px", textAlign: "center", maxWidth: "480px", width: "100%", boxShadow: "0 4px 24px rgba(15,15,20,0.08)" };
const btnStyle  = { display: "inline-block", marginTop: "16px", padding: "12px 24px", borderRadius: "10px", background: "#1a1b26", color: "#fff", textDecoration: "none", fontSize: "14px", fontWeight: "600", cursor: "pointer", border: "none" };

export default function Ga4CallbackPage() {
  const data = useLoaderData();

  if (data.status === "success" || data.status === "success_cached") {
    if (typeof window !== "undefined") {
      setTimeout(() => { window.location.href = `${data.appBaseUrl}/app/ga4?connected=1`; }, 1500);
    }
    return (
      <div style={pageStyle}><div style={cardStyle}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>✓</div>
        <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#22915c", marginBottom: "12px" }}>GA4 Connected!</h1>
        <p style={{ color: "#6B7280", marginBottom: "8px" }}>Google Analytics 4 connected successfully.</p>
        {data.property && <p style={{ fontSize: "13px", color: "#374151" }}>Property: <strong>{data.property.name}</strong></p>}
        <p style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "16px" }}>Redirecting back to the app...</p>
        <a href={`${data.appBaseUrl}/app/ga4?connected=1`} style={{ ...btnStyle, background: "#22915c" }}>Go to AI Traffic Monitor →</a>
      </div></div>
    );
  }

  if (data.status === "error" || data.status === "no_properties") {
    return (
      <div style={pageStyle}><div style={cardStyle}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>✕</div>
        <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#e84118", marginBottom: "12px" }}>
          {data.status === "no_properties" ? "No GA4 Properties" : "Connection Failed"}
        </h1>
        <p style={{ color: "#6B7280", marginBottom: "16px" }}>{data.message}</p>
        <a href={`${data.appBaseUrl}/app/ga4`} style={btnStyle}>← Back</a>
      </div></div>
    );
  }

  if (data.status === "pick_property") {
    async function selectProperty(p) {
      const resp = await fetch("/api/ga4/save-property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: p.id, propertyName: p.name, storeId: data.storeId }),
      });
      const d = await resp.json();
      if (d.success) {
        window.location.href = data.appBaseUrl + "/app/ga4?ga4_connected=1";
      }
    }

    return (
      <div style={pageStyle}><div style={{ ...cardStyle, maxWidth: "560px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#111827", marginBottom: "12px" }}>Select GA4 Property</h1>
        <p style={{ color: "#6B7280", marginBottom: "24px" }}>Found {data.properties.length} GA4 properties. Select the one for your Shopify store:</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {data.properties.map(p => (
            <button key={p.id} onClick={() => selectProperty(p)} style={{ width: "100%", padding: "14px 16px", borderRadius: "10px", border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: "600", color: "#111827" }}>{p.name}</div>
                {p.websiteUrl && <div style={{ fontSize: "12px", color: "#6B7280" }}>{p.websiteUrl}</div>}
              </div>
              <span style={{ color: "#22915c", fontWeight: "600" }}>Select →</span>
            </button>
          ))}
        </div>
      </div></div>
    );
  }

  return <div style={pageStyle}><div style={cardStyle}><p>Connecting to Google Analytics...</p></div></div>;
}
