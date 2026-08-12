// app/lib/seo/internal-linking.server.js
// Kimono SEO — Internal Linking Engine (#04)
// Replaces [INTERNAL LINK: description] placeholders with real URLs
// Matching strategy: semantic keyword extraction → multi-layer DB search

import prisma from "../../db.server.js";

// ── Romanian stopwords to skip in keyword extraction ──
const RO_STOPWORDS = new Set([
  "de","la","cu","in","pe","si","sau","dar","ca","sa","se","nu","din","mai",
  "ale","are","este","care","poate","pentru","unui","unei","unui","unui",
  "toate","acest","aceasta","aceste","aceasta","fie","iar","daca","dupa",
  "fara","prin","intre","despre","catre","pana","unde","cand","cum","cel",
  "cea","cei","cele","unui","unei","tot","toata","acest","aceasta","mult",
  "multe","multi","putine","putini","alt","alta","alte","alti","doar","inca",
  "deja","acum","atunci","aici","acolo","bine","bun","buna","bune","buni",
  "mare","mari","mic","mici","nou","noua","noi","vechi","veche","vechi",
  "primul","prima","primii","primele","ultim","ultima","ultimii","ultimele",
]);

/**
 * Extract meaningful keywords from a placeholder description
 * e.g. "colecție baloane petrecere copii — vivimall.ro"
 *   → ["baloane", "petrecere", "copii"]
 */
function extractKeywords(description) {
  return description
    .toLowerCase()
    .replace(/[—–\-\/\\|]/g, " ")
    .replace(/[^\w\sșțăîâ]/g, " ")
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !RO_STOPWORDS.has(w))
    .slice(0, 8);
}

/**
 * Score a candidate (product or article) against keywords
 * Returns 0-100 relevance score
 */
function scoreCandidate(candidate, keywords) {
  const text = (candidate.searchText || "").toLowerCase();
  const title = (candidate.title || "").toLowerCase();
  let score = 0;
  let matches = 0;

  for (const kw of keywords) {
    if (text.includes(kw)) {
      matches++;
      // Exact word boundary match scores higher
      const wordBoundary = new RegExp(`\\b${kw}\\b`, "i");
      score += wordBoundary.test(text) ? 15 : 8;
    }
  }

  // Bonus: multiple keyword matches = higher relevance
  if (matches >= 3) score += 25;
  else if (matches >= 2) score += 10;

  // Strong bonus: keyword appears in title
  for (const kw of keywords) {
    if (title.includes(kw)) score += 20;
  }

  // Penalty: title much longer than keywords suggests weak match
  // (e.g. "cutii baloane" matching "transport animale" is accidental)
  const keywordDensity = matches / Math.max(keywords.length, 1);
  if (keywordDensity < 0.2 && score < 50) score = Math.floor(score * 0.4);

  // Articles get a relevance bonus (editorial content more trustworthy)
  if (candidate.type === "article") score += 10;

  return Math.min(score, 100);
}

/**
 * Find the best matching product or article for a placeholder description
 * Returns { url, title, type } or null
 */
async function findBestMatch(description, storeId, shopDomain, usedUrls = new Set()) {
  const keywords = extractKeywords(description);
  if (keywords.length === 0) return null;

  const candidates = [];

  // ── Layer 1: Search products by title (join with SeoAudit for handle) ──
  const products = await prisma.seoProduct.findMany({
    where: {
      storeId,
      status: { not: "deleted" },
      OR: keywords.map(kw => ({
        productTitle: { contains: kw, mode: "insensitive" },
      })),
    },
    take: 10,
    select: { productId: true, productTitle: true, aiTag: true, aiSub: true },
  });

  // Get handles from SeoAudit
  const productIds = products.map(p => p.productId);
  const audits = productIds.length > 0 ? await prisma.seoAudit.findMany({
    where: { storeId, productId: { in: productIds } },
    select: { productId: true, productHandle: true },
  }) : [];
  const handleMap = Object.fromEntries(audits.map(a => [a.productId, a.productHandle]));

  for (const p of products) {
    const handle = handleMap[p.productId];
    // Skip products without a real handle (numeric IDs make bad URLs)
    if (!handle || /^\d+$/.test(handle)) continue;
    const url = `https://${shopDomain}/products/${handle}`;
    if (usedUrls.has(url)) continue;
    candidates.push({
      url,
      title: p.productTitle,
      type: "product",
      searchText: `${p.productTitle} ${p.aiTag || ""} ${p.aiSub || ""}`,
    });
  }

  // ── Layer 2: Search blog articles ──
  const articles = await prisma.blogArticle.findMany({
    where: {
      storeId,
      status: "published",
      OR: keywords.map(kw => ({
        primaryKeyword: { contains: kw, mode: "insensitive" },
      })),
    },
    take: 5,
    select: {
      urlSlug: true,
      h1: true,
      titleTag: true,
      primaryKeyword: true,
    },
  });

  for (const a of articles) {
    const url = `https://${shopDomain}/blogs/news/${a.urlSlug}`;
    if (usedUrls.has(url)) continue;
    candidates.push({
      url,
      title: a.h1 || a.titleTag || a.primaryKeyword,
      type: "article",
      searchText: `${a.primaryKeyword} ${a.h1 || ""} ${a.titleTag || ""}`,
    });
  }

  // ── Layer 3: Search by tags if few candidates ──
  if (candidates.length < 3 && keywords.length > 0) {
    const tagProducts = await prisma.seoProduct.findMany({
      where: {
        storeId,
        status: { not: "deleted" },
        OR: keywords.map(kw => ({
          aiTag: { contains: kw, mode: "insensitive" },
        })),
      },
      take: 5,
      select: {
        productId: true,
        productTitle: true,
        aiTag: true,
        aiSub: true,
      },
    });

    for (const p of tagProducts) {
      const numericId = p.productId.replace("gid://shopify/Product/", "");
      // Skip if no real handle available
      if (!numericId || /^\d+$/.test(numericId)) continue;
      const url = `https://${shopDomain}/products/${numericId}`;
      if (usedUrls.has(url) || candidates.some(c => c.url === url)) continue;
      candidates.push({
        url,
        title: p.productTitle,
        type: "product",
        searchText: `${p.productTitle} ${p.aiTag || ""} ${p.aiSub || ""}`,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Score and rank all candidates
  const scored = candidates.map(c => ({
    ...c,
    score: scoreCandidate(c, keywords),
  })).filter(c => c.score >= 15)  // Pre-filter weak candidates
    .sort((a, b) => b.score - a.score);

  return scored[0] || null;
}

/**
 * Generate clean anchor text from placeholder description
 * e.g. "colecție baloane petrecere copii — vivimall.ro"
 *   → "baloane petrecere copii"
 */
function buildAnchorText(description, matchTitle) {
  // Remove domain references and clean up
  const cleaned = description
    .replace(/—.*$/, "")                    // Remove — domain
    .replace(/\bvivimall\.ro\b/gi, "")
    .replace(/\bshop\b/gi, "")
    .replace(/colecție\s*/gi, "")
    .replace(/colectie\s*/gi, "")
    .replace(/pagina\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Use cleaned description if meaningful, else first 4 words of match title
  if (cleaned.length >= 5 && cleaned.length <= 60) return cleaned;
  return matchTitle.split(" ").slice(0, 4).join(" ");
}

/**
 * Main function: resolve all [INTERNAL LINK: ...] placeholders in markdown content
 * Returns markdown with placeholders replaced by real <a> links
 */
export async function resolveInternalLinks(content, storeId, shopDomain) {
  if (!content) return content;

  const pattern = /\[INTERNAL LINK:\s*([^\]]+)\]/g;
  const matches = [...content.matchAll(pattern)];

  if (matches.length === 0) return content;

  console.log(`[Internal Linking] Found ${matches.length} placeholders`);

  let result = content;
  const usedUrls = new Set();
  let resolved = 0;
  let removed = 0;

  for (const match of matches) {
    const fullMatch = match[0];
    const description = match[1].trim();

    const best = await findBestMatch(description, storeId, shopDomain, usedUrls);

    if (best && best.score >= 40) {  // Min score 40 — below this, match is too weak
      const anchor = buildAnchorText(description, best.title);
      const link = `[${anchor}](${best.url})`;
      result = result.replace(fullMatch, link);
      usedUrls.add(best.url);
      resolved++;
      console.log(`[Internal Linking] ✓ "${description.slice(0, 40)}" → ${best.url} (score: ${best.score})`);
    } else {
      // Remove placeholder if no match found
      result = result.replace(fullMatch, "");
      removed++;
      console.log(`[Internal Linking] ✗ No match for: "${description.slice(0, 40)}"`);
    }
  }

  console.log(`[Internal Linking] Resolved: ${resolved}, Removed: ${removed}`);
  return result;
}

/**
 * Contextual linking: when no [INTERNAL LINK:] placeholders exist,
 * find keyword mentions in the article and wrap them with links
 * Max 5 links, each keyword used once, min 300 chars between links
 */
export async function insertContextualLinks(content, storeId, shopDomain) {
  if (!content) return { content, linksAdded: 0 };

  // Get all products with titles
  const products = await prisma.seoProduct.findMany({
    where: { storeId, status: { not: "deleted" } },
    take: 50,
    select: { productId: true, productTitle: true, aiTag: true },
  });

  // Get product handles from SeoAudit
  const productIds = products.map(p => p.productId);
  const audits = productIds.length > 0 ? await prisma.seoAudit.findMany({
    where: { storeId, productId: { in: productIds } },
    select: { productId: true, productHandle: true },
  }) : [];
  const handleMap = Object.fromEntries(audits.map(a => [a.productId, a.productHandle]));

  // Get published articles
  const articles = await prisma.blogArticle.findMany({
    where: { storeId, status: "published" },
    take: 20,
    select: { urlSlug: true, h1: true, primaryKeyword: true },
  });

  // Build candidates: keyword → url
  const candidates = [];

  for (const p of products) {
    const handle = handleMap[p.productId];
    // Skip products without a real handle (numeric IDs make bad URLs)
    if (!handle || /^\d+$/.test(handle)) continue;
    const url = `https://${shopDomain}/products/${handle}`;
    // Use shortest meaningful words from title (3+ chars, not stopwords)
    // Use the most specific word (longest) from title, min 5 chars to avoid generic matches
    const words = p.productTitle.toLowerCase().split(/\s+/).filter(w => w.length >= 5 && !RO_STOPWORDS.has(w));
    if (words.length > 0) {
      // Use longest word for more specific matching
      const bestWord = words.sort((a, b) => b.length - a.length)[0];
      candidates.push({ keyword: bestWord, fullTitle: p.productTitle, url, type: "product" });
    }
  }

  for (const a of articles) {
    const url = `https://${shopDomain}/blogs/news/${a.urlSlug}`;
    // For articles, try to match on key words from the primary keyword
    const kwWords = (a.primaryKeyword || "").toLowerCase().split(/\s+/).filter(w => w.length >= 5 && !RO_STOPWORDS.has(w));
    for (const kw of kwWords.slice(0, 2)) {
      candidates.push({ keyword: kw, fullTitle: a.h1 || a.primaryKeyword, url, type: "article" });
    }
  }

  if (candidates.length === 0) return { content, linksAdded: 0 };

  let result = content;
  let linksAdded = 0;
  const usedUrls = new Set();
  const usedKeywords = new Set();
  let lastLinkPos = -300;

  // Sort: articles first (more relevant for editorial content), then by keyword length
  candidates.sort((a, b) => {
    if (a.type === "article" && b.type !== "article") return -1;
    if (b.type === "article" && a.type !== "article") return 1;
    return b.keyword.length - a.keyword.length;
  });

  for (const c of candidates) {
    if (linksAdded >= 5) break;
    if (usedUrls.has(c.url) || usedKeywords.has(c.keyword)) continue;

    // Find keyword in content (case-insensitive, word boundary)
    const regex = new RegExp(`(^|[^\\[\\w])(${c.keyword})([^\\]\\w]|$)`, "im");
    const match = regex.exec(result);
    if (!match) continue;

    const pos = match.index + match[1].length;
    if (pos - lastLinkPos < 300) continue; // too close to previous link

    // Don't link inside existing <a> tags, headings, or URLs
    const before = result.slice(Math.max(0, pos - 100), pos);
    const after = result.slice(pos, pos + 100);
    if (before.includes("<h") || before.includes("<a ") || before.includes("href=")) continue;
    if (before.includes("](") || before.includes("http") || after.includes("](")) continue;
    // Don't link if keyword appears inside an existing markdown link
    const surroundingText = result.slice(Math.max(0, pos - 200), pos + 200);
    if (/\[([^\]]*)\]\([^)]*\)/.test(surroundingText.slice(0, 200))) continue;

    // Insert HTML anchor directly (avoids markdownToHtml regex issues with complex URLs)
    const anchor = match[2];
    result = result.slice(0, pos) + `<a href="${c.url}">${anchor}</a>` + result.slice(pos + anchor.length);
    usedUrls.add(c.url);
    usedKeywords.add(c.keyword);
    lastLinkPos = pos;
    linksAdded++;
    console.log(`[Internal Linking] Contextual: "${anchor}" → ${c.url}`);
  }

  return { content: result, linksAdded };
}
