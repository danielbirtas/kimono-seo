// app/lib/seo/session-helper.server.js
// Token refresh helper for background jobs.
// Routes use authenticate.admin() which auto-refreshes, but background
// processors load sessions directly from Prisma — skipping refresh.
// This helper checks expiration and refreshes via Shopify token exchange.

import prisma from "../../db.server.js";

const TOKEN_EXCHANGE_URL = "https://accounts.shopify.com/oauth/token";

/**
 * Get a valid offline access token for background jobs.
 * If the current token is expired and a refresh token exists, performs
 * a token rotation and updates the session in the database.
 */
export async function getValidOfflineSession(shopDomain) {
  const session = await prisma.session.findFirst({
    where:   { shop: shopDomain, isOnline: false },
    orderBy: { expires: "desc" },
  });

  if (!session) throw new Error(`No offline session for ${shopDomain}`);
  if (!session.accessToken) throw new Error(`No access token for ${shopDomain}`);

  // Token not expired yet — use as-is
  if (!session.expires || new Date() < new Date(session.expires)) {
    return session;
  }

  // Token expired — try refresh. If no refresh token, use existing token anyway
  // (Shopify sometimes accepts "expired" tokens, and stores installed before
  // expiringOfflineAccessTokens don't have refresh tokens at all).
  if (!session.refreshToken) {
    console.warn(`[session-helper] Token expired but no refresh token for ${shopDomain} — using existing token`);
    return session;
  }

  console.log(`[session-helper] Refreshing expired token for ${shopDomain}`);

  const clientId     = process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET for token refresh");

  let resp;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      resp = await fetch(TOKEN_EXCHANGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type:    "refresh_token",
          client_id:     clientId,
          client_secret: clientSecret,
          refresh_token: session.refreshToken,
        }),
        signal: AbortSignal.timeout(15000),
      });
      break;
    } catch (err) {
      const isTransient = err.name === "AbortError" || err.message === "fetch failed";
      if (!isTransient || attempt === 2) {
        console.warn(`[session-helper] Token refresh network error, using existing token:`, err.message);
        return session; // Fall back to existing token
      }
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }

  if (!resp?.ok) {
    const errText = await resp?.text().catch(() => "") || "";
    console.warn(`[session-helper] Token refresh failed ${resp?.status}:`, errText, "— using existing token");
    return session; // Fall back to existing token instead of crashing
  }

  const data = await resp.json();

  // Update session in DB
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : null;

  await prisma.session.update({
    where: { id: session.id },
    data: {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token || session.refreshToken,
      expires:      expiresAt,
    },
  });

  console.log(`[session-helper] Token refreshed for ${shopDomain}, expires ${expiresAt?.toISOString()}`);

  return {
    ...session,
    accessToken:  data.access_token,
    refreshToken: data.refresh_token || session.refreshToken,
    expires:      expiresAt,
  };
}
