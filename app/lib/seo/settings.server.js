// app/lib/seo/settings.server.js
// ═══ Kimono SEO — SEO Settings Helper ═══
import prisma from "../../db.server.js";
import {
  SEO_KEYS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_KW_PER_BUCKET,
  DEFAULT_MIN_VOLUME,
  DEFAULT_TAG_PROMPT,
} from "./constants.js";

export async function getSeoSetting(storeId, key, defaultValue = "") {
  const row = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key } },
  });
  return row?.value ?? defaultValue;
}

export async function setSeoSetting(storeId, key, value) {
  return prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key } },
    update: { value: String(value) },
    create: { storeId, key, value: String(value) },
  });
}

export async function getAllSeoSettings(storeId) {
  const rows = await prisma.seoSetting.findMany({ where: { storeId } });
  const map = {};
  for (const r of rows) map[r.key] = r.value;

  return {
    // AI Tagging
    aiPrompt:    map[SEO_KEYS.AI_PROMPT]     || DEFAULT_TAG_PROMPT,
    batchSize:   parseInt(map[SEO_KEYS.BATCH_SIZE]    || DEFAULT_BATCH_SIZE,    10),
    kwPerBucket: parseInt(map[SEO_KEYS.KW_PER_BUCKET] || DEFAULT_KW_PER_BUCKET, 10),
    minVolume:   parseInt(map[SEO_KEYS.MIN_VOLUME]    || DEFAULT_MIN_VOLUME,    10),
    // Google Search Console
    gscAccessToken:  map[SEO_KEYS.GSC_ACCESS_TOKEN]  || "",
    gscRefreshToken: map[SEO_KEYS.GSC_REFRESH_TOKEN] || "",
    gscTokenExpiry:  map[SEO_KEYS.GSC_TOKEN_EXPIRY]  || "",
    gscSiteUrl:      map[SEO_KEYS.GSC_SITE_URL]      || "",
    // IndexNow
    indexNowEnabled: map[SEO_KEYS.INDEXNOW_ENABLED] === "true",
    indexNowKey:     map[SEO_KEYS.INDEXNOW_KEY]     || "",
  };
}

export async function saveAllSeoSettings(storeId, data) {
  const pairs = [
    [SEO_KEYS.AI_PROMPT,     data.aiPrompt],
    [SEO_KEYS.BATCH_SIZE,    data.batchSize],
    [SEO_KEYS.KW_PER_BUCKET, data.kwPerBucket],
    [SEO_KEYS.MIN_VOLUME,    data.minVolume],
  ];

  await prisma.$transaction(
    pairs
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([key, value]) =>
        prisma.seoSetting.upsert({
          where:  { storeId_key: { storeId, key } },
          update: { value: String(value) },
          create: { storeId, key, value: String(value) },
        })
      )
  );
}

export async function saveGscTokens(storeId, { accessToken, refreshToken, expiresAt, siteUrl }) {
  const pairs = [
    [SEO_KEYS.GSC_ACCESS_TOKEN,  accessToken],
    [SEO_KEYS.GSC_REFRESH_TOKEN, refreshToken],
    [SEO_KEYS.GSC_TOKEN_EXPIRY,  String(expiresAt)],
  ];
  if (siteUrl !== null) pairs.push([SEO_KEYS.GSC_SITE_URL, siteUrl || ""]);

  await prisma.$transaction(
    pairs
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([key, value]) =>
        prisma.seoSetting.upsert({
          where:  { storeId_key: { storeId, key } },
          update: { value: String(value) },
          create: { storeId, key, value: String(value) },
        })
      )
  );
}

export async function clearGscTokens(storeId) {
  await prisma.seoSetting.deleteMany({
    where: {
      storeId,
      key: { in: [SEO_KEYS.GSC_ACCESS_TOKEN, SEO_KEYS.GSC_REFRESH_TOKEN, SEO_KEYS.GSC_TOKEN_EXPIRY, SEO_KEYS.GSC_SITE_URL] },
    },
  });
}

export function isGscConnected(settings) {
  return !!(settings.gscAccessToken && settings.gscRefreshToken);
}

export function gscTokenNeedsRefresh(settings) {
  if (!settings.gscTokenExpiry) return true;
  return Date.now() > parseInt(settings.gscTokenExpiry, 10) - 5 * 60 * 1000;
}
