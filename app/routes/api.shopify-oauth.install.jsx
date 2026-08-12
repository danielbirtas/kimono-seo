// api.shopify-oauth.install.jsx
// Initiates Shopify OAuth flow for Custom Distribution App

import { redirect } from "react-router";
import crypto from "crypto";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response("Missing shop parameter. Use ?shop=your-store.myshopify.com", { status: 400 });
  }

  // Normalize domain
  const domain = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const appUrl = process.env.APP_URL || process.env.SHOPIFY_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/shopify-oauth/callback`;
  const scopes = "read_customers,write_customers,read_products,read_orders,read_inventory,read_reports";

  // Generate nonce for CSRF protection
  const state = crypto.randomBytes(16).toString("hex");

  // Store state in a short-lived cookie (5 min)
  const authUrl = `https://${domain}/admin/oauth/authorize?` +
    `client_id=${clientId}` +
    `&scope=${scopes}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  return redirect(authUrl, {
    headers: {
      "Set-Cookie": `shopify_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
    },
  });
};
