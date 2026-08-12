// app/lib/seo/oauth-state.server.js
// CSRF-safe OAuth `state` for the 4 third-party OAuth integrations
// (Bing, Pinterest, GSC, GA4). The state we ship to the provider is
// `base64url(nonce.shopDomain)`; the nonce is also persisted on our side
// in seoSetting with a 10-minute expiry, and consumed (deleted) on callback.
//
// Previous implementation used `base64(shopDomain)` alone — anyone who
// knew the shop domain (public information) could forge a valid state
// and have the OAuth callback wire arbitrary credentials onto a victim
// store. The nonce makes the state both unforgeable AND single-use.

import crypto from "node:crypto";
import prisma from "../../db.server.js";

const NONCE_TTL_MS = 10 * 60 * 1000;

function keyFor(provider) {
  return `${provider}_oauth_nonce`;
}

export async function mintOauthState({ shopDomain, provider }) {
  if (!shopDomain || !provider) {
    throw new Error("mintOauthState: missing shopDomain or provider");
  }
  const store = await prisma.store.findUnique({ where: { shopDomain }, select: { id: true } });
  if (!store) throw new Error(`mintOauthState: Store not found for ${shopDomain}`);

  const nonce  = crypto.randomBytes(16).toString("hex");
  const expiry = Date.now() + NONCE_TTL_MS;

  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId: store.id, key: keyFor(provider) } },
    create: { storeId: store.id, key: keyFor(provider), value: `${nonce}:${expiry}` },
    update: { value: `${nonce}:${expiry}` },
  });

  return Buffer.from(`${nonce}.${shopDomain}`).toString("base64url");
}

export async function verifyOauthState({ state, provider }) {
  if (!state || !provider) return { valid: false, shopDomain: null, reason: "missing state or provider" };

  let decoded;
  try {
    decoded = Buffer.from(state, "base64url").toString("utf8");
  } catch {
    try { decoded = Buffer.from(state, "base64").toString("utf8"); }
    catch { return { valid: false, shopDomain: null, reason: "state not decodable" }; }
  }

  const dot = decoded.indexOf(".");
  if (dot < 0) return { valid: false, shopDomain: null, reason: "no nonce separator (legacy or invalid)" };
  const nonce      = decoded.slice(0, dot);
  const shopDomain = decoded.slice(dot + 1);
  if (!shopDomain.endsWith(".myshopify.com")) {
    return { valid: false, shopDomain: null, reason: "shopDomain not myshopify" };
  }

  const store = await prisma.store.findUnique({ where: { shopDomain }, select: { id: true } });
  if (!store) return { valid: false, shopDomain, reason: "store not found" };

  const saved = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId: store.id, key: keyFor(provider) } },
  });
  if (!saved?.value) return { valid: false, shopDomain, reason: "no stored nonce (replay attempt or expired)" };

  const [savedNonce, expStr] = saved.value.split(":");
  if (!savedNonce || savedNonce !== nonce) {
    return { valid: false, shopDomain, reason: "nonce mismatch" };
  }
  if (Date.now() > parseInt(expStr, 10)) {
    return { valid: false, shopDomain, reason: "nonce expired" };
  }

  await prisma.seoSetting.delete({
    where: { storeId_key: { storeId: store.id, key: keyFor(provider) } },
  }).catch(() => {});

  return { valid: true, shopDomain };
}
