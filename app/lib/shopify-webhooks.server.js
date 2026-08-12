// app/lib/shopify-webhooks.server.js
// Register/deregister Shopify webhooks for a store.
// Stores webhook IDs in SeoSetting for later cleanup.

import crypto from "crypto";
import prisma from "../db.server.js";
import { webhookCallbackUrl } from "./webhook-verify.server.js";

const TOPICS = [
  { topic: "PRODUCTS_CREATE", path: "/webhooks/products/create" },
  { topic: "PRODUCTS_UPDATE", path: "/webhooks/products/update" },
  { topic: "PRODUCTS_DELETE", path: "/webhooks/products/delete" },
];

export async function registerWebhooks({ storeId, shopDomain, accessToken }) {
  // Generate or reuse per-store webhook secret
  const secretRow = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "webhook_secret" } },
  });
  let secret = secretRow?.value;
  if (!secret) {
    secret = crypto.randomBytes(32).toString("hex");
    await prisma.seoSetting.create({
      data: { storeId, key: "webhook_secret", value: secret },
    });
  }

  const results = [];
  for (const { topic, path } of TOPICS) {
    const callbackUrl = webhookCallbackUrl(path, secret);
    const result = await createWebhook({ shopDomain, accessToken, topic, callbackUrl });
    results.push({ topic, ...result });

    if (result.id) {
      await prisma.seoSetting.upsert({
        where:  { storeId_key: { storeId, key: `webhook_id_${topic}` } },
        update: { value: result.id },
        create: { storeId, key: `webhook_id_${topic}`, value: result.id },
      });
    }
  }

  return { secret, results };
}

async function createWebhook({ shopDomain, accessToken, topic, callbackUrl }) {
  const mutation = `
    mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        webhookSubscription { id }
        userErrors { field message }
      }
    }
  `;
  const variables = {
    topic,
    webhookSubscription: { callbackUrl, format: "JSON" },
  };

  const resp = await fetch(`https://${shopDomain}/admin/api/2025-04/graphql.json`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body:    JSON.stringify({ query: mutation, variables }),
  });
  if (!resp.ok) return { error: `HTTP ${resp.status}` };

  const data = await resp.json();
  const errs = data?.data?.webhookSubscriptionCreate?.userErrors || [];
  // "Address for this topic has already been taken" → benign, already registered
  const alreadyExists = errs.some((e) => /already been taken|has already been set/i.test(e.message || ""));
  if (alreadyExists) return { alreadyExists: true };
  if (errs.length) return { error: errs.map((e) => e.message).join("; ") };

  const id = data?.data?.webhookSubscriptionCreate?.webhookSubscription?.id || null;
  return { id };
}

export async function deregisterWebhooks({ storeId, shopDomain, accessToken }) {
  const rows = await prisma.seoSetting.findMany({
    where: { storeId, key: { startsWith: "webhook_id_" } },
  });

  for (const row of rows) {
    await deleteWebhook({ shopDomain, accessToken, id: row.value }).catch(() => {});
    await prisma.seoSetting.delete({ where: { id: row.id } }).catch(() => {});
  }
}

async function deleteWebhook({ shopDomain, accessToken, id }) {
  const mutation = `
    mutation webhookSubscriptionDelete($id: ID!) {
      webhookSubscriptionDelete(id: $id) { userErrors { message } }
    }
  `;
  await fetch(`https://${shopDomain}/admin/api/2025-04/graphql.json`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body:    JSON.stringify({ query: mutation, variables: { id } }),
  });
}
