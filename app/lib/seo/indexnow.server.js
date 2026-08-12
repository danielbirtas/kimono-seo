// app/lib/seo/indexnow.server.js
// ═══ Kimono SEO — IndexNow Notifier (#29) ═══
// Notifies Bing, Copilot, Yandex instantly when collections are created/updated.
// Protocol: https://www.indexnow.org
// Cost: Free. No API key from Bing needed beyond a self-generated key.

import prisma from "../../db.server.js";
import { SEO_KEYS } from "./constants.js";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/**
 * Get or create an IndexNow API key for a store.
 * The key is stored in SeoSetting and must also be served at /{key}.txt on the domain.
 */
export async function getIndexNowKey(storeId) {
  const existing = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: "seo_indexnow_key" } },
  });
  if (existing?.value) return existing.value;

  // Generate a new key (32 hex chars)
  const key = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await prisma.seoSetting.create({
    data: { storeId, key: "seo_indexnow_key", value: key },
  });

  return key;
}

/**
 * Submit URLs to IndexNow (Bing/Copilot/Yandex).
 * Called after creating/updating collections.
 *
 * @param {string} shopDomain - e.g. "mystore.myshopify.com" or custom domain
 * @param {string[]} urls     - Full URLs to submit
 * @param {string} apiKey     - IndexNow key for this store
 * @returns {{ submitted: number, ok: boolean }}
 */
export async function submitToIndexNow(shopDomain, urls, apiKey) {
  if (!urls.length) return { submitted: 0, ok: true };

  // IndexNow accepts up to 10k URLs per request
  const chunks = chunkArray(urls, 10000);
  let totalSubmitted = 0;

  for (const chunk of chunks) {
    try {
      const body = {
        host:        shopDomain,
        key:         apiKey,
        keyLocation: `https://${shopDomain}/${apiKey}.txt`,
        urlList:     chunk,
      };

      const resp = await fetch(INDEXNOW_ENDPOINT, {
        method:  "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body:    JSON.stringify(body),
      });

      // 200 or 202 = success
      if (resp.status === 200 || resp.status === 202) {
        totalSubmitted += chunk.length;
        console.log(`[IndexNow] Submitted ${chunk.length} URLs for ${shopDomain}`);
      } else {
        const text = await resp.text().catch(() => "");
        console.warn(`[IndexNow] ${resp.status}: ${text}`);
      }
    } catch (err) {
      console.error(`[IndexNow] Error:`, err.message);
    }
  }

  return { submitted: totalSubmitted, ok: totalSubmitted > 0 };
}

/**
 * Submit collection URLs after apply.
 * Builds full URLs from collection handles.
 *
 * @param {string} storeId
 * @param {string} shopDomain
 * @param {string[]} collectionHandles
 */
export async function notifyCollectionsCreated(storeId, shopDomain, collectionHandles) {
  if (!collectionHandles.length) return;

  const apiKey = await getIndexNowKey(storeId);
  const urls   = collectionHandles.map((h) => `https://${shopDomain}/collections/${h}`);

  return submitToIndexNow(shopDomain, urls, apiKey);
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}
