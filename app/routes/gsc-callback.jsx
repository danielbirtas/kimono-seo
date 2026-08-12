// app/routes/gsc-callback.jsx
// Kimono SEO — Google Search Console OAuth Callback
// PUBLIC ROUTE — no Shopify auth (Google redirects here directly)

import { useLoaderData } from "react-router";
import prisma from "../db.server.js";
import { exchangeGscCode, listGscSites } from "../lib/seo/gsc.server.js";
import { saveGscTokens } from "../lib/seo/settings.server.js";

function getAppBaseUrl() {
  return process.env.APP_URL || "http://localhost:3000";
}

export const loader = async ({ request }) => {
  const url   = new URL(request.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  let shopDomain = "";
  try {
    shopDomain = Buffer.from(state || "", "base64").toString("utf8");
  } catch {
    return { status: "error", message: "Invalid state parameter. Please try connecting again.", appBaseUrl: "" };
  }

  if (!shopDomain) {
    return { status: "error", message: "Missing shop information. Please try connecting again.", appBaseUrl: "" };
  }

  const appBaseUrl = getAppBaseUrl();

  if (error) {
    return { status: "error", message: `Google returned an error: ${error}. Please try again.`, appBaseUrl };
  }

  if (!code) {
    return { status: "error", message: "No authorization code received.", appBaseUrl };
  }

  const store = await prisma.store.findUnique({ where: { shopDomain } });
  if (!store) {
    return { status: "error", message: "Store not found. Please reinstall the app.", appBaseUrl };
  }

  try {
    const { accessToken, refreshToken, expiresAt } = await exchangeGscCode(code, shopDomain);

    let sites = [];
    try {
      sites = await listGscSites(accessToken);
    } catch (siteErr) {
      console.warn("[GSC Callback] Could not fetch sites:", siteErr.message);
    }

    if (sites.length === 0) {
      await saveGscTokens(store.id, { accessToken, refreshToken, expiresAt, siteUrl: "" });
      return { status: "no_sites", appBaseUrl, message: "Connected, but no sites found in your Google Search Console account. Please add your site to GSC first." };
    }

    if (sites.length === 1) {
      await saveGscTokens(store.id, { accessToken, refreshToken, expiresAt, siteUrl: sites[0] });
      return { status: "success", siteUrl: sites[0], appBaseUrl };
    }

    await saveGscTokens(store.id, { accessToken, refreshToken, expiresAt, siteUrl: "" });
    return { status: "pick_site", sites, storeId: store.id, appBaseUrl };

  } catch (err) {
    console.error("[GSC Callback] Error:", err);

    // invalid_grant = code already used = tokens were already saved on first attempt
    // Treat as success to avoid confusing the user
    if (err.message?.includes("invalid_grant")) {
      return { status: "success_cached", appBaseUrl };
    }

    return { status: "error", message: err.message || "Failed to connect Google Search Console.", appBaseUrl };
  }
};

export const action = async ({ request }) => {
  const formData   = await request.formData();
  const siteUrl    = formData.get("siteUrl");
  const storeId    = formData.get("storeId");
  const appBaseUrl = formData.get("appBaseUrl");

  if (!siteUrl || !storeId) {
    return { status: "error", message: "Missing site or store info.", appBaseUrl };
  }

  const { setSeoSetting } = await import("../lib/seo/settings.server.js");
  const { SEO_KEYS }      = await import("../lib/seo/constants.js");
  await setSeoSetting(storeId, SEO_KEYS.GSC_SITE_URL, siteUrl);

  return { status: "success", siteUrl, appBaseUrl };
};

// ── Styles ──
const COLORS = {
  ink900: "#0f0f14", ink800: "#1a1b26", ink400: "#7c7e96", ink100: "#e8e9ee", ink50: "#f4f4f7",
  white: "#ffffff", jade500: "#22915c", jade100: "#ecfaf2", accent500: "#e84118", ocean500: "#2471a3",
};
const pageStyle = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f4f7", fontFamily: "'SF Pro Text', -apple-system, BlinkMacSystemFont, sans-serif", padding: "20px" };
const cardStyle = { background: COLORS.white, borderRadius: "16px", padding: "48px 40px", textAlign: "center", maxWidth: "480px", width: "100%", boxShadow: "0 4px 24px rgba(15,15,20,0.08)" };
const h1Style   = { fontSize: "26px", fontWeight: "800", color: COLORS.ink900, margin: "0 0 12px", letterSpacing: "-0.03em" };
const pStyle    = { fontSize: "15px", color: COLORS.ink400, lineHeight: "1.6", margin: "0 0 16px" };
const btnStyle  = { display: "inline-block", marginTop: "16px", padding: "12px 24px", borderRadius: "10px", background: COLORS.ink800, color: COLORS.white, textDecoration: "none", fontSize: "14px", fontWeight: "600", cursor: "pointer", border: "none" };
const siteBtnStyle = { width: "100%", display: "flex", alignItems: "center", padding: "14px 16px", borderRadius: "10px", border: `1px solid ${COLORS.ink100}`, background: COLORS.white, cursor: "pointer", textAlign: "left" };

export default function GscCallbackPage() {
  const data = useLoaderData();

  // Success — auto-redirect
  if (data.status === "success" || data.status === "success_cached") {
    if (typeof window !== "undefined") {
      setTimeout(() => { window.location.href = `/app/seo/settings?gsc_connected=1`; }, 1500);
    }
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>✓</div>
          <h1 style={{ ...h1Style, color: COLORS.jade500 }}>Connected!</h1>
          <p style={pStyle}>Google Search Console connected successfully.</p>
          {data.siteUrl && <p style={{ ...pStyle, fontSize: "13px" }}>Tracking: <strong>{data.siteUrl}</strong></p>}
          <p style={{ ...pStyle, fontSize: "12px", marginTop: "16px" }}>Redirecting back to the app...</p>
          <a href={`${data.appBaseUrl}/app/seo/settings?gsc_connected=1`} style={{ ...btnStyle, background: COLORS.jade500 }}>
            Go to Settings →
          </a>
        </div>
      </div>
    );
  }

  // Error / no sites
  if (data.status === "error" || data.status === "no_sites") {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>✕</div>
          <h1 style={{ ...h1Style, color: COLORS.accent500 }}>
            {data.status === "no_sites" ? "No Sites Found" : "Connection Failed"}
          </h1>
          <p style={{ ...pStyle, color: COLORS.ink400 }}>{data.message}</p>
          {data.status === "no_sites" && (
            <p style={{ ...pStyle, fontSize: "13px" }}>
              Go to <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" style={{ color: COLORS.ocean500 }}>Google Search Console</a> and add your store's URL as a property, then try connecting again.
            </p>
          )}
          {data.appBaseUrl && (
            <a href={`${data.appBaseUrl}/app/seo/settings`} style={btnStyle}>
              ← Back to Settings
            </a>
          )}
        </div>
      </div>
    );
  }

  // Site picker
  if (data.status === "pick_site") {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, maxWidth: "560px" }}>
          <h1 style={h1Style}>Select a Property</h1>
          <p style={pStyle}>
            We found {data.sites.length} properties in your Google Search Console account.
            Select the one that matches your Shopify store:
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "24px 0" }}>
            {data.sites.map((site) => (
              <form key={site} method="POST">
                <input type="hidden" name="siteUrl"    value={site} />
                <input type="hidden" name="storeId"    value={data.storeId} />
                <input type="hidden" name="appBaseUrl" value={data.appBaseUrl} />
                <button type="submit" style={siteBtnStyle}>
                  <span style={{ fontSize: "14px", fontWeight: "600", color: COLORS.ink900 }}>{site}</span>
                  <span style={{ fontSize: "12px", color: COLORS.jade500, marginLeft: "auto" }}>Select →</span>
                </button>
              </form>
            ))}
          </div>
          <p style={{ fontSize: "12px", color: COLORS.ink400, textAlign: "center" }}>
            Not sure? <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" style={{ color: COLORS.ocean500 }}>Check Google Search Console</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <p style={pStyle}>Connecting to Google Search Console...</p>
      </div>
    </div>
  );
}
