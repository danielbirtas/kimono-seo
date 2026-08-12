// app/lib/seo/site-focus.server.js
// Topical focus / drift detector. Approximates the siteFocusScore +
// siteRadius leak attributes from Google's internal Content Warehouse:
//   - siteFocusScore = how concentrated the site is around a core nicheor
//   - siteRadius     = average distance of a page's topic from that core
//
// We can't compute the exact embedding-distance scores Google uses, but the
// product taxonomy (SeoProduct.aiTag) gives a very good proxy for what the
// site is "about", and we can flag blog articles + product groups that
// drift far from that core.
//
// Output:
//   {
//     totalProducts, taggedProducts, tagCoverage,
//     topClusters: [{tag, count, share}],
//     focusScore: 0-100 (Herfindahl-Hirschman concentration index normalized)
//     blogDrift:  [{articleId, title, primaryKeyword, status: aligned|fringe|off-topic}]
//   }

import prisma from "../../db.server.js";

function normalize(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(s, minLen = 3) {
  return normalize(s).split(" ").filter(t => t.length >= minLen);
}

// HHI normalized: 1/N (uniform) → 0, 1 (single tag) → 100.
// This rewards concentration without punishing healthy multi-cluster sites.
function computeFocusScore(distribution) {
  const total = distribution.reduce((s, d) => s + d.count, 0);
  if (total === 0 || distribution.length === 0) return 0;
  let hhi = 0;
  for (const d of distribution) {
    const share = d.count / total;
    hhi += share * share;
  }
  // HHI ranges from 1/N to 1; normalize to 0-100.
  const minHHI = 1 / distribution.length;
  const norm   = (hhi - minHHI) / (1 - minHHI || 1);
  return Math.round(norm * 100);
}

export async function analyzeSiteFocus(storeId, { blogDriftLookback = 50 } = {}) {
  const [totalProducts, taggedGroups, articles] = await Promise.all([
    prisma.seoProduct.count({ where: { storeId } }),
    prisma.seoProduct.groupBy({
      by: ["aiTag"],
      where: { storeId, aiTag: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { aiTag: "desc" } },
    }),
    prisma.blogArticle.findMany({
      where:  { storeId, status: { in: ["draft", "review", "published"] } },
      select: { id: true, primaryKeyword: true, titleTag: true },
      orderBy: { generatedAt: "desc" },
      take:   blogDriftLookback,
    }),
  ]);

  const taggedProducts = taggedGroups.reduce((s, g) => s + (g._count?._all || 0), 0);
  const tagCoverage    = totalProducts > 0 ? Math.round((taggedProducts / totalProducts) * 100) : 0;

  const distribution = taggedGroups.map(g => ({
    tag:   g.aiTag,
    count: g._count?._all || 0,
    share: taggedProducts > 0 ? (g._count?._all || 0) / taggedProducts : 0,
  }));

  const focusScore = computeFocusScore(distribution);
  const topClusters = distribution.slice(0, 10).map(d => ({ tag: d.tag, count: d.count, share: Math.round(d.share * 100) }));

  // Drift detection: token-overlap between each article and the top cluster
  // tags. An article whose primaryKeyword shares ≥1 token with a top cluster
  // = aligned; ≥1 token with any cluster = fringe; zero overlap = off-topic.
  const topTokens     = new Set(topClusters.slice(0, 5).flatMap(c => tokens(c.tag)));
  const allTagTokens  = new Set(distribution.flatMap(d => tokens(d.tag)));

  const blogDrift = articles.map(a => {
    const articleTokens = tokens(`${a.titleTag || ""} ${a.primaryKeyword || ""}`);
    const inTop   = articleTokens.some(t => topTokens.has(t));
    const inAny   = articleTokens.some(t => allTagTokens.has(t));
    const status  = inTop ? "aligned" : inAny ? "fringe" : "off-topic";
    return {
      articleId:      a.id,
      title:          a.titleTag || a.primaryKeyword,
      primaryKeyword: a.primaryKeyword,
      status,
    };
  });

  const drift = {
    aligned:    blogDrift.filter(b => b.status === "aligned"  ).length,
    fringe:     blogDrift.filter(b => b.status === "fringe"   ).length,
    offTopic:   blogDrift.filter(b => b.status === "off-topic").length,
  };

  return {
    totalProducts,
    taggedProducts,
    tagCoverage,
    focusScore,
    topClusters,
    blogDrift,
    drift,
    interpretation: interpret(focusScore, drift, articles.length),
  };
}

function interpret(focusScore, drift, articleCount) {
  if (articleCount === 0) {
    return { level: "info", message: "Nu există articole de blog încă — focus-score-ul reflectă doar catalogul de produse." };
  }
  const offTopicRatio = articleCount > 0 ? drift.offTopic / articleCount : 0;
  if (focusScore >= 60 && offTopicRatio < 0.15) {
    return { level: "ok",      message: "Topical authority puternică — domeniul e concentrat pe o nișă clară și blog-ul rămâne aliniat." };
  }
  if (focusScore < 30) {
    return { level: "warning", message: "Catalog distribuit pe prea multe nișe. Google's siteFocusScore favorizează site-urile cu acoperire exhaustivă a unei nișe față de generaliști — consider să-ți consolidezi tematic." };
  }
  if (offTopicRatio >= 0.3) {
    return { level: "warning", message: `${drift.offTopic}/${articleCount} articole de blog se abat de la cluster-ele principale — risc de topical drift care diluează autoritatea.` };
  }
  if (offTopicRatio >= 0.15) {
    return { level: "info",    message: `${drift.offTopic}/${articleCount} articole sunt off-topic. Acceptabil dacă acoperă întrebări adiacente; demotezi dacă sunt off-brand.` };
  }
  return { level: "info", message: "Focus topical decent — câteva articole fringe dar nimic alarmant." };
}
