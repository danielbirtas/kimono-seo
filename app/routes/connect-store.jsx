// app/routes/connect-store.jsx
// Kimono SEO — Connect a Shopify or WooCommerce store

import { useActionData, useLoaderData, useNavigation, Link } from "react-router";
import { redirect } from "react-router";
import { useState } from "react";
import { requireAuth } from "../lib/auth/index.server.js";
import { testShopifyConnection } from "../lib/integrations/shopify/client.server.js";
import { testWooConnection } from "../lib/integrations/woocommerce/client.server.js";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { user } = await requireAuth(request);
  const url = new URL(request.url);

  const connections = await prisma.storeConnection.findMany({
    where:   { userId: user.id },
    orderBy: { connectedAt: "desc" },
  });

  // Handle OAuth success redirect
  const oauthStatus = url.searchParams.get("oauth");
  const oauthShop = url.searchParams.get("shop");
  let oauthMessage = null;
  if (oauthStatus === "success" && oauthShop) {
    oauthMessage = `Magazinul ${oauthShop} a fost conectat cu succes prin Shopify OAuth!`;
  }

  // Handle pending OAuth (user logged in after OAuth callback while not authenticated)
  const cookies = request.headers.get("cookie") || "";
  const pendingMatch = cookies.match(/shopify_pending=([A-Za-z0-9+/=]+)/);
  let pendingLinked = null;

  if (pendingMatch) {
    try {
      const { shop, token } = JSON.parse(Buffer.from(pendingMatch[1], "base64").toString());
      const test = await testShopifyConnection(shop, token);
      if (test.ok) {
        await prisma.storeConnection.upsert({
          where: { userId_shopDomain: { userId: user.id, shopDomain: shop } },
          update: { accessToken: token, isActive: true, updatedAt: new Date() },
          create: { userId: user.id, shopDomain: shop, accessToken: token, platform: "SHOPIFY" },
        });
        await prisma.store.upsert({
          where: { shopDomain: shop },
          update: { shopName: test.shopName || shop, isActive: true },
          create: { shopDomain: shop, shopName: test.shopName || shop },
        });
        pendingLinked = shop;
      }
    } catch {}
  }

  // If we consumed a pending cookie, clear it
  const headers = { "Content-Type": "application/json" };
  if (pendingMatch) {
    headers["Set-Cookie"] = "shopify_pending=; Path=/; HttpOnly; Secure; Max-Age=0";
  }

  // Re-fetch connections (may have changed from pending link)
  const freshConnections = pendingLinked
    ? await prisma.storeConnection.findMany({ where: { userId: user.id }, orderBy: { connectedAt: "desc" } })
    : connections;

  return new Response(
    JSON.stringify({ user, connections: freshConnections, oauthMessage, pendingLinked }),
    { headers }
  );
};

export const action = async ({ request }) => {
  const { user } = await requireAuth(request);
  const formData  = await request.formData();
  const intent    = formData.get("intent");

  // ── Disconnect a store ────────────────────────────────────────────────────
  if (intent === "disconnect") {
    const connectionId = formData.get("connectionId");
    const conn = await prisma.storeConnection.findFirst({
      where: { id: connectionId, userId: user.id },
      select: { shopDomain: true, accessToken: true, platform: true },
    });

    await prisma.storeConnection.updateMany({
      where: { id: connectionId, userId: user.id },
      data:  { isActive: false },
    });

    if (conn?.platform === "SHOPIFY") {
      (async () => {
        try {
          const store = await prisma.store.findUnique({ where: { shopDomain: conn.shopDomain }, select: { id: true } });
          if (store) {
            const { deregisterWebhooks } = await import("../lib/shopify-webhooks.server.js");
            await deregisterWebhooks({ storeId: store.id, shopDomain: conn.shopDomain, accessToken: conn.accessToken });
          }
        } catch (e) {
          console.error("[disconnect-store] webhook deregister failed:", e.message);
        }
      })();
    }

    return { success: "Magazin deconectat." };
  }

  // ── Set active store ──────────────────────────────────────────────────────
  if (intent === "set-active") {
    const connectionId = formData.get("connectionId");
    await prisma.storeConnection.updateMany({ where: { userId: user.id }, data: { isActive: false } });
    await prisma.storeConnection.update({ where: { id: connectionId }, data: { isActive: true } });
    return redirect("/app");
  }

  // ── Connect Shopify (manual) ──────────────────────────────────────────────
  if (intent === "connect-shopify") {
    const domain = formData.get("domain")?.toString().trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    const token  = formData.get("token")?.toString().trim();

    if (!domain || !token) return { error: "Domain si token sunt obligatorii." };

    const test = await testShopifyConnection(domain, token);
    if (!test.ok) return { error: `Nu ma pot conecta la Shopify: ${test.error}` };

    await prisma.storeConnection.upsert({
      where:  { userId_shopDomain: { userId: user.id, shopDomain: domain } },
      update: { accessToken: token, isActive: true, updatedAt: new Date() },
      create: { userId: user.id, shopDomain: domain, accessToken: token, platform: "SHOPIFY" },
    });

    const store = await prisma.store.upsert({
      where:  { shopDomain: domain },
      update: { shopName: test.shopName || domain, isActive: true },
      create: { shopDomain: domain, shopName: test.shopName || domain },
    });

    (async () => {
      try {
        const { registerWebhooks } = await import("../lib/shopify-webhooks.server.js");
        await registerWebhooks({ storeId: store.id, shopDomain: domain, accessToken: token });
      } catch (e) {
        console.error("[connect-store] webhook registration failed:", e.message);
      }
    })();

    return { success: `Conectat la ${test.shopName || domain} cu succes!` };
  }

  // ── Connect WooCommerce ───────────────────────────────────────────────────
  if (intent === "connect-woo") {
    const rawDomain      = formData.get("wooDomain")?.toString().trim() || "";
    const consumerKey    = formData.get("consumerKey")?.toString().trim() || "";
    const consumerSecret = formData.get("consumerSecret")?.toString().trim() || "";

    const domain = rawDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");

    if (!domain || !consumerKey || !consumerSecret) {
      return { error: "Domain, Consumer Key si Consumer Secret sunt obligatorii." };
    }
    if (!consumerKey.startsWith("ck_")) {
      return { error: "Consumer Key trebuie sa inceapa cu 'ck_'." };
    }
    if (!consumerSecret.startsWith("cs_")) {
      return { error: "Consumer Secret trebuie sa inceapa cu 'cs_'." };
    }

    const accessToken = `${consumerKey}:${consumerSecret}`;

    const test = await testWooConnection(domain, accessToken);
    if (!test.ok) return { error: `Nu ma pot conecta la WooCommerce: ${test.error}` };

    await prisma.storeConnection.upsert({
      where:  { userId_shopDomain: { userId: user.id, shopDomain: domain } },
      update: { accessToken, isActive: true, updatedAt: new Date() },
      create: { userId: user.id, shopDomain: domain, accessToken, platform: "WOOCOMMERCE" },
    });

    await prisma.store.upsert({
      where:  { shopDomain: domain },
      update: { shopName: test.shopName || domain, isActive: true },
      create: { shopDomain: domain, shopName: test.shopName || domain },
    });

    return { success: `Conectat la WooCommerce (${test.shopName || domain}) cu succes!` };
  }

  return { error: "Actiune necunoscuta." };
};

const S = {
  page:   { padding: "32px", maxWidth: "680px", margin: "0 auto", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  h1:     { fontSize: "22px", fontWeight: "700", color: "#111827", marginBottom: "4px" },
  sub:    { fontSize: "13px", color: "#6B7280", marginBottom: "32px" },
  card:   { background: "#fff", border: "1px solid #E5E7EB", borderRadius: "10px", padding: "24px", marginBottom: "20px" },
  sTitle: { fontSize: "14px", fontWeight: "600", color: "#111827", marginBottom: "16px" },
  label:  { display: "block", fontSize: "12px", fontWeight: "600", color: "#374151", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" },
  input:  { width: "100%", padding: "9px 12px", border: "1px solid #D1D5DB", borderRadius: "7px", fontSize: "13px", fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: "16px" },
  btn:    { padding: "9px 18px", background: "#111827", color: "#fff", border: "none", borderRadius: "7px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" },
  btnOAuth: { padding: "12px 24px", background: "#5E8E3E", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", width: "100%", marginBottom: "4px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" },
  btnSm:  { padding: "5px 12px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: "6px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" },
  btnAct: { padding: "5px 12px", background: "#111827", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" },
  err:    { background: "#FCEBEB", border: "1px solid #F09595", borderRadius: "7px", padding: "10px 14px", fontSize: "13px", color: "#A32D2D", marginBottom: "20px" },
  ok:     { background: "#EAF3DE", border: "1px solid #C0DD97", borderRadius: "7px", padding: "10px 14px", fontSize: "13px", color: "#3B6D11", marginBottom: "20px" },
  help:   { fontSize: "12px", color: "#6B7280", marginBottom: "16px" },
  divider: { display: "flex", alignItems: "center", gap: "12px", margin: "20px 0", fontSize: "12px", color: "#9CA3AF" },
  divLine: { flex: 1, height: "1px", background: "#E5E7EB" },
  row:    { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F3F4F6" },
  dot:    (active) => ({ width: "8px", height: "8px", borderRadius: "50%", background: active ? "#22C55E" : "#D1D5DB", flexShrink: 0 }),
  tabBar: { display: "flex", gap: "0", marginBottom: "20px", borderBottom: "1px solid #E5E7EB" },
  tab:    (active) => ({
    padding: "8px 18px", fontSize: "13px", fontWeight: "500", cursor: "pointer",
    background: "none", border: "none", borderBottom: active ? "2px solid #111827" : "2px solid transparent",
    color: active ? "#111827" : "#6B7280", marginBottom: "-1px", fontFamily: "inherit",
  }),
};

const PLATFORM_LABELS = { SHOPIFY: "Shopify", WOOCOMMERCE: "WooCommerce" };

export default function ConnectStore() {
  const { connections, oauthMessage, pendingLinked } = useLoaderData();
  const data             = useActionData();
  const navigation       = useNavigation();
  const loading          = navigation.state !== "idle";

  const [tab, setTab] = useState("shopify");
  const [showManual, setShowManual] = useState(false);
  const [oauthShop, setOauthShop] = useState("");

  const successMsg = oauthMessage || (pendingLinked ? `Magazinul ${pendingLinked} a fost conectat cu succes!` : null) || data?.success;

  return (
    <div style={S.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px" }}>
        <div>
          <div style={S.h1}>Connect Store</div>
          <div style={S.sub}>Adauga sau gestioneaza conexiunile tale de magazin</div>
        </div>
        <Link to="/app" style={{ fontSize: "13px", color: "#3B82F6", textDecoration: "none" }}>&#8592; Dashboard</Link>
      </div>

      {data?.error  && <div style={S.err}>{data.error}</div>}
      {successMsg   && <div style={S.ok}>{successMsg}</div>}

      {/* Existing connections */}
      {connections.length > 0 && (
        <div style={S.card}>
          <div style={S.sTitle}>Magazine conectate</div>
          {connections.map((conn) => (
            <div key={conn.id} style={S.row}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={S.dot(conn.isActive)} />
                <div>
                  <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{conn.shopDomain}</div>
                  <div style={{ fontSize: "11px", color: "#9CA3AF" }}>
                    {PLATFORM_LABELS[conn.platform] || conn.platform} &middot; conectat {new Date(conn.connectedAt).toLocaleDateString("ro")}
                    {conn.isActive && <span style={{ marginLeft: "6px", color: "#22C55E", fontWeight: "600" }}>&bull; activ</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                {!conn.isActive && (
                  <form method="post">
                    <input type="hidden" name="intent" value="set-active" />
                    <input type="hidden" name="connectionId" value={conn.id} />
                    <button type="submit" style={S.btnAct}>Activeaza</button>
                  </form>
                )}
                <form method="post">
                  <input type="hidden" name="intent" value="disconnect" />
                  <input type="hidden" name="connectionId" value={conn.id} />
                  <button type="submit" style={S.btnSm}>Deconecteaza</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add new store — platform tabs */}
      <div style={S.card}>
        <div style={S.sTitle}>Adauga magazin nou</div>

        <div style={S.tabBar}>
          <button style={S.tab(tab === "shopify")} onClick={() => setTab("shopify")}>Shopify</button>
          <button style={S.tab(tab === "woo")} onClick={() => setTab("woo")}>WooCommerce</button>
        </div>

        {/* ── Shopify ── */}
        {tab === "shopify" && (
          <div>
            {/* One-Click OAuth */}
            <div style={{ marginBottom: "8px" }}>
              <div style={S.help}>
                Introdu domeniul Shopify al magazinului tau si apasa butonul verde.
                Vei fi redirectionat catre Shopify pentru a autoriza conexiunea &mdash; un singur click.
              </div>
              <label style={S.label}>Shop Domain</label>
              <input
                type="text"
                placeholder="magazin.myshopify.com"
                value={oauthShop}
                onChange={(e) => setOauthShop(e.target.value)}
                style={S.input}
              />
              <button
                style={S.btnOAuth}
                onClick={() => {
                  const shop = oauthShop.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
                  if (!shop) { alert("Introdu domeniul Shopify."); return; }
                  window.location.href = `/api/shopify-oauth/install?shop=${encodeURIComponent(shop)}`;
                }}
              >
                Conecteaza cu Shopify (un click)
              </button>
            </div>

            {/* Divider */}
            <div style={S.divider}>
              <div style={S.divLine} />
              <span>sau conectare manuala</span>
              <div style={S.divLine} />
            </div>

            {/* Toggle manual form */}
            {!showManual ? (
              <button
                style={{ ...S.btnSm, width: "100%", textAlign: "center", marginTop: "8px" }}
                onClick={() => setShowManual(true)}
              >
                Conectare cu Access Token (avansat)
              </button>
            ) : (
              <form method="post" style={{ marginTop: "16px" }}>
                <input type="hidden" name="intent" value="connect-shopify" />
                <div style={S.help}>
                  Du-te la Shopify Admin &rarr; Settings &rarr; Apps and sales channels &rarr; Develop apps &rarr;
                  creeaza o aplicatie privata cu permisiunile necesare.
                </div>
                <label style={S.label}>Shop Domain</label>
                <input name="domain" type="text" placeholder="magazin.myshopify.com" style={S.input} required />
                <label style={S.label}>Admin API Access Token</label>
                <input name="token" type="password" placeholder="shpat_..." style={S.input} required />
                <button type="submit" style={S.btn} disabled={loading}>
                  {loading ? "Se conecteaza..." : "Conecteaza Shopify"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── WooCommerce ── */}
        {tab === "woo" && (
          <form method="post">
            <input type="hidden" name="intent" value="connect-woo" />
            <div style={S.help}>
              Du-te la WooCommerce &rarr; Settings &rarr; Advanced &rarr; REST API &rarr; Add key.
              Seteaza permisiunile la <strong>Read/Write</strong> si copiaza Consumer Key si Consumer Secret.
            </div>
            <label style={S.label}>Site URL</label>
            <input name="wooDomain" type="text" placeholder="magazin.ro" style={S.input} required />
            <label style={S.label}>Consumer Key</label>
            <input name="consumerKey" type="text" placeholder="ck_..." style={S.input} required />
            <label style={S.label}>Consumer Secret</label>
            <input name="consumerSecret" type="password" placeholder="cs_..." style={S.input} required />
            <button type="submit" style={S.btn} disabled={loading}>
              {loading ? "Se conecteaza..." : "Conecteaza WooCommerce"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
