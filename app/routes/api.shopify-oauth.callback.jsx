// api.shopify-oauth.callback.jsx
// Handles Shopify OAuth callback — exchanges code for access_token, creates StoreConnection

import { redirect } from "react-router";
import crypto from "crypto";
import prisma from "../db.server.js";
import { testShopifyConnection } from "../lib/integrations/shopify/client.server.js";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const hmac = url.searchParams.get("hmac");

  if (!shop || !code || !state) {
    return new Response("Missing required parameters (shop, code, state).", { status: 400 });
  }

  // ── Verify state (CSRF) ──────────────────────────────────────────────────
  const cookies = request.headers.get("cookie") || "";
  const stateMatch = cookies.match(/shopify_oauth_state=([a-f0-9]+)/);
  const savedState = stateMatch?.[1];

  if (!savedState || savedState !== state) {
    return new Response("Invalid state parameter. Please try again.", { status: 403 });
  }

  // ── Verify HMAC ──────────────────────────────────────────────────────────
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (hmac) {
    const params = new URLSearchParams(url.search);
    params.delete("hmac");
    params.sort();
    const message = params.toString();
    const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");
    if (digest !== hmac) {
      return new Response("HMAC validation failed.", { status: 403 });
    }
  }

  // ── Exchange code for permanent access token ─────────────────────────────
  const domain = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const tokenRes = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: secret,
      code,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("[shopify-oauth] Token exchange failed:", errText);
    return new Response(`Token exchange failed: ${tokenRes.status}`, { status: 502 });
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    return new Response("No access token received from Shopify.", { status: 502 });
  }

  // ── Verify token works ───────────────────────────────────────────────────
  const test = await testShopifyConnection(domain, accessToken);
  if (!test.ok) {
    return new Response(`Token received but connection test failed: ${test.error}`, { status: 502 });
  }

  // ── Find or create a user placeholder (will be linked at login) ──────────
  // Check if there's a logged-in user via session cookie
  let userId = null;
  try {
    const { requireAuth } = await import("../lib/auth/index.server.js");
    const auth = await requireAuth(request);
    userId = auth.user.id;
  } catch {
    // Not logged in — store connection for later linking
  }

  if (userId) {
    // ── Create StoreConnection ───────────────────────────────────────────
    await prisma.storeConnection.upsert({
      where: { userId_shopDomain: { userId, shopDomain: domain } },
      update: { accessToken, isActive: true, updatedAt: new Date() },
      create: { userId, shopDomain: domain, accessToken, platform: "SHOPIFY" },
    });

    // ── Create/update Store record ───────────────────────────────────────
    const store = await prisma.store.upsert({
      where: { shopDomain: domain },
      update: { shopName: test.shopName || domain, isActive: true },
      create: { shopDomain: domain, shopName: test.shopName || domain },
    });

    // ── Register webhooks (fire-and-forget) ──────────────────────────────
    (async () => {
      try {
        const { registerWebhooks } = await import("../lib/shopify-webhooks.server.js");
        await registerWebhooks({ storeId: store.id, shopDomain: domain, accessToken });
      } catch (e) {
        console.error("[shopify-oauth] webhook registration failed:", e.message);
      }
    })();

    // Clear state cookie and redirect to dashboard
    return redirect("/connect-store?oauth=success&shop=" + encodeURIComponent(domain), {
      headers: {
        "Set-Cookie": "shopify_oauth_state=; Path=/; HttpOnly; Secure; Max-Age=0",
      },
    });
  }

  // ── Not logged in — store token temporarily and redirect to login ──────
  // Encode shop+token in a short-lived cookie so we can link after login
  const pending = Buffer.from(JSON.stringify({ shop: domain, token: accessToken })).toString("base64");

  return redirect("/login?oauth_pending=1", {
    headers: {
      "Set-Cookie": [
        "shopify_oauth_state=; Path=/; HttpOnly; Secure; Max-Age=0",
        `shopify_pending=${pending}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      ].join(", "),
    },
  });
};
