// app/lib/seo/crawl-404.server.js
// Kimono SEO M05a — 404 Detection: crawl sitemap + internal links, log 404s

import prisma from "../../db.server.js";
import crypto from "node:crypto";

function sha1(s) { return crypto.createHash("sha1").update(s).digest("hex"); }

async function fetchText(url, timeout = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "Kimono-Crawl404/1.0" } });
    clearTimeout(timer);
    return { status: resp.status, text: resp.ok ? await resp.text() : "" };
  } catch { clearTimeout(timer); return { status: 0, text: "" }; }
}

async function checkStatus(url, timeout = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, method: "HEAD", redirect: "follow", headers: { "User-Agent": "Kimono-Crawl404/1.0" } });
    clearTimeout(timer);
    return resp.status;
  } catch { clearTimeout(timer); return 0; }
}

function extractUrlsFromSitemap(xml, baseUrl) {
  const urls = new Set();
  const locRegex = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = locRegex.exec(xml)) !== null) {
    const u = m[1].trim();
    if (u.startsWith("http")) urls.add(u);
  }
  return [...urls];
}

function extractLinksFromHtml(html, baseUrl) {
  const urls = new Set();
  const hrefRegex = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let m;
  while ((m = hrefRegex.exec(html)) !== null) {
    try {
      const u = new URL(m[1], baseUrl).toString().split("#")[0];
      if (u.startsWith("http")) urls.add(u);
    } catch {}
  }
  return [...urls];
}

export async function crawl404s(storeId, options = {}) {
  const { maxSampleSize = 1000, maxSitemapUrls = 2000 } = options;
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { shopDomain: true } });
  if (!store) throw new Error("Store not found");

  const conn = await prisma.storeConnection.findFirst({
    where: { shopDomain: store.shopDomain, isActive: true, platform: "SHOPIFY" },
    orderBy: { connectedAt: "desc" },
  });

  // Determine site URL from primary domain
  let siteUrl = `https://${store.shopDomain}`;
  if (conn?.accessToken) {
    try {
      const r = await fetch(`https://${store.shopDomain}/admin/api/2025-04/graphql.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": conn.accessToken },
        body: JSON.stringify({ query: `{ shop { primaryDomain { url } } }` }),
      });
      const d = await r.json();
      if (d.data?.shop?.primaryDomain?.url) siteUrl = d.data.shop.primaryDomain.url.replace(/\/$/, "");
    } catch {}
  }

  // 1. Fetch sitemap and extract URLs
  const sitemapUrl = `${siteUrl}/sitemap.xml`;
  const { text: sitemapXml } = await fetchText(sitemapUrl);
  let candidateUrls = [];

  if (sitemapXml) {
    const nested = extractUrlsFromSitemap(sitemapXml, siteUrl);
    // If sitemap contains <sitemap> index, fetch children
    const childSitemaps = nested.filter(u => u.endsWith(".xml"));
    if (childSitemaps.length > 0) {
      for (const ch of childSitemaps.slice(0, 4)) {
        const { text: t } = await fetchText(ch);
        if (t) candidateUrls.push(...extractUrlsFromSitemap(t, siteUrl));
      }
    } else {
      candidateUrls = nested;
    }
  }

  // 2. Also scrape homepage for internal links (sometimes sitemap misses them)
  const { text: homeHtml } = await fetchText(siteUrl);
  if (homeHtml) {
    const homeLinks = extractLinksFromHtml(homeHtml, siteUrl)
      .filter(u => u.startsWith(siteUrl));
    candidateUrls.push(...homeLinks);
  }

  // Dedupe + limit
  candidateUrls = [...new Set(candidateUrls)].slice(0, maxSitemapUrls);

  // 3. Random sample (test a subset to avoid overwhelming target site)
  const sample = candidateUrls.sort(() => Math.random() - 0.5).slice(0, maxSampleSize);

  // 4. Check status codes with concurrency limit
  const results = [];
  const concurrency = 8;
  for (let i = 0; i < sample.length; i += concurrency) {
    const chunk = sample.slice(i, i + concurrency);
    const part = await Promise.all(chunk.map(async u => ({ url: u, status: await checkStatus(u) })));
    results.push(...part);
  }

  // 5. Log 404s (and 410s)
  const broken = results.filter(r => r.status === 404 || r.status === 410);
  for (const b of broken) {
    const urlHash = sha1(b.url);
    await prisma.seo404Detection.upsert({
      where: { storeId_urlHash: { storeId, urlHash } },
      create: { storeId, url: b.url, urlHash, statusCode: b.status, referrers: [siteUrl], occurrences: 1 },
      update: { lastSeenAt: new Date(), occurrences: { increment: 1 }, statusCode: b.status },
    });
  }

  return {
    checked: sample.length,
    totalCandidates: candidateUrls.length,
    broken: broken.length,
    brokenUrls: broken.map(b => b.url),
  };
}

export async function markResolved(storeId, id, redirectedTo = null) {
  return prisma.seo404Detection.update({
    where: { id },
    data:  { status: "redirected", redirectedTo, resolvedAt: new Date() },
  });
}

export async function ignore404(storeId, id) {
  return prisma.seo404Detection.update({
    where: { id },
    data:  { status: "ignored", resolvedAt: new Date() },
  });
}
