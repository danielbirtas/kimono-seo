import { data } from "react-router";
import { requireAuth } from "../lib/auth/index.server.js";
import prisma from "../db.server.js";

export async function loader({ request }) {
  const { user, connection, storeId } = await requireAuth(request);

  const shopDomain = connection?.shopDomain ?? null;

  // ── Setup checks (no storeId needed for env vars) ──────────────────────────
  const anthropicConfigured = !!process.env.ANTHROPIC_API_KEY;
  const dfsConfigured =
    !!process.env.DATAFORSEO_LOGIN && !!process.env.DATAFORSEO_PASSWORD;

  // ── Early return if no store connected ─────────────────────────────────────
  if (!storeId) {
    const setup = {
      storeConnected: false,
      gscConnected: false,
      ga4Connected: false,
      anthropicConfigured,
      dfsConfigured,
      bingConfigured: !!process.env.BING_API_KEY,
      completedSteps: 0,
      totalSteps: 5,
    };

    const completedSteps = [
      setup.storeConnected,
      setup.gscConnected,
      setup.ga4Connected,
      setup.anthropicConfigured,
      setup.dfsConfigured || setup.bingConfigured,
    ].filter(Boolean).length;

    setup.completedSteps = completedSteps;

    return data({
      user: {
        name: user.name,
        email: user.email,
        plan: user.plan,
        role: user.role,
        trialCreditUsed: user.trialCreditUsed,
        trialEndsAt: user.trialEndsAt,
      },
      shopDomain,
      stats: {
        productsTotal: 0,
        productsTagged: 0,
        productsAudited: 0,
        avgSeoScore: 0,
        scoreDistribution: { good: 0, warning: 0, critical: 0 },
        keywordsTotal: 0,
        keywordsWithVolume: 0,
        collectionsCreated: 0,
        articlesTotal: 0,
        articlesPublished: 0,
        redirectsPending: 0,
        redirectsApplied: 0,
        proposalsTotal: 0,
        proposalsApplied: 0,
        llmsTxtScore: 0,
        gscKeywordsTriaged: 0,
      },
      features: buildFeatures({ storeId: null, settings: {}, counts: {} }),
      setup,
      activeJob: null,
      llmUsage: {
        totalCostUsd: user.trialCreditUsed ?? 0,
        trialLimit: 10.0,
        byFeature: [],
      },
    });
  }

  // ── Fetch all data in parallel ──────────────────────────────────────────────
  const [
    productsTotal,
    productsTagged,
    auditStats,
    auditScoreGroups,
    keywordsTotal,
    keywordsWithVolume,
    collectionsCreated,
    articlesTotal,
    articlesPublished,
    redirectsPending,
    redirectsApplied,
    proposalsTotal,
    proposalsApplied,
    llmsTxtRecord,
    gscKeywordsTriaged,
    seoSettings,
    activeJob,
    usageLogs,
    usageByFeature,
  ] = await Promise.all([
    // products total
    prisma.seoProduct.count({ where: { storeId } }).catch(() => 0),

    // products tagged (aiTag not null)
    prisma.seoProduct
      .count({ where: { storeId, aiTag: { not: null } } })
      .catch(() => 0),

    // audit aggregates
    prisma.seoAudit
      .aggregate({
        where: { storeId },
        _count: { id: true },
        _avg: { score: true },
      })
      .catch(() => ({ _count: { id: 0 }, _avg: { score: 0 } })),

    // score distribution: good ≥80, warning 50-79, critical <50
    Promise.all([
      prisma.seoAudit
        .count({ where: { storeId, score: { gte: 80 } } })
        .catch(() => 0),
      prisma.seoAudit
        .count({ where: { storeId, score: { gte: 50, lt: 80 } } })
        .catch(() => 0),
      prisma.seoAudit
        .count({ where: { storeId, score: { lt: 50 } } })
        .catch(() => 0),
    ]),

    // keywords total
    prisma.seoKeyword.count({ where: { storeId } }).catch(() => 0),

    // keywords with volume > 0
    prisma.seoKeyword
      .count({ where: { storeId, volume: { gt: 0 } } })
      .catch(() => 0),

    // collections created
    prisma.seoKeyword
      .count({ where: { storeId, collectionCreated: true } })
      .catch(() => 0),

    // articles total
    prisma.blogArticle.count({ where: { storeId } }).catch(() => 0),

    // articles published
    prisma.blogArticle
      .count({ where: { storeId, status: "published" } })
      .catch(() => 0),

    // redirects pending
    prisma.redirectSuggestion
      .count({ where: { storeId, status: "pending" } })
      .catch(() => 0),

    // redirects applied
    prisma.redirectSuggestion
      .count({ where: { storeId, status: "applied" } })
      .catch(() => 0),

    // proposals total
    prisma.seoTaxonomyProposal.count({ where: { storeId } }).catch(() => 0),

    // proposals applied
    prisma.seoTaxonomyProposal
      .count({ where: { storeId, status: "APPLIED" } })
      .catch(() => 0),

    // llmsTxt record
    prisma.llmsTxt
      .findUnique({ where: { storeId }, select: { score: true, publishedAt: true } })
      .catch(() => null),

    // gsc keywords triaged
    prisma.gscTriageResult.count({ where: { storeId } }).catch(() => 0),

    // all seo settings for this store
    prisma.seoSetting
      .findMany({ where: { storeId }, select: { key: true, value: true } })
      .catch(() => []),

    // active job (QUEUED or RUNNING, most recent)
    prisma.seoJob
      .findFirst({
        where: { storeId, status: { in: ["QUEUED", "RUNNING"] } },
        orderBy: { queuedAt: "desc" },
        select: {
          id: true,
          type: true,
          status: true,
          progressPct: true,
          statusMessage: true,
          queuedAt: true,
        },
      })
      .catch(() => null),

    // usage: total cost for this user
    prisma.usageLog
      .aggregate({
        where: { userId: user.id },
        _sum: { costUsd: true },
      })
      .catch(() => ({ _sum: { costUsd: 0 } })),

    // usage by feature
    prisma.usageLog
      .groupBy({
        by: ["feature"],
        where: { userId: user.id },
        _sum: { costUsd: true, tokensIn: true, tokensOut: true },
        orderBy: { _sum: { costUsd: "desc" } },
      })
      .catch(() => []),
  ]);

  // ── Derived stats ───────────────────────────────────────────────────────────
  const productsAudited = auditStats._count?.id ?? 0;
  const avgSeoScore = Math.round(auditStats._avg?.score ?? 0);
  const [goodCount, warningCount, criticalCount] = auditScoreGroups;

  // ── Settings map ────────────────────────────────────────────────────────────
  const settingsMap = {};
  for (const s of seoSettings) {
    settingsMap[s.key] = s.value;
  }

  // ── Setup ───────────────────────────────────────────────────────────────────
  const storeConnected = true;
  const gscConnected = !!settingsMap["seo_gsc_refresh_token"];
  const ga4Connected = !!settingsMap["ga4_property_id"];
  const bingConfigured =
    !!settingsMap["bing_api_key"] || !!process.env.BING_API_KEY;

  const setupChecks = [
    storeConnected,
    gscConnected,
    ga4Connected,
    anthropicConfigured,
    dfsConfigured || bingConfigured,
  ];
  const completedSteps = setupChecks.filter(Boolean).length;

  const setup = {
    storeConnected,
    gscConnected,
    ga4Connected,
    anthropicConfigured,
    dfsConfigured,
    bingConfigured,
    completedSteps,
    totalSteps: 5,
  };

  // ── Most recent audit date ──────────────────────────────────────────────────
  let lastAuditRun = null;
  if (productsAudited > 0) {
    const lastAudit = await prisma.seoAudit
      .findFirst({
        where: { storeId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      })
      .catch(() => null);
    lastAuditRun = lastAudit?.updatedAt ?? null;
  }

  // ── Features ────────────────────────────────────────────────────────────────
  const counts = {
    productsAudited,
    productsTagged,
    keywordsTotal,
    articlesTotal,
    llmsTxtRecord,
    redirectsPending,
    redirectsApplied,
    gscKeywordsTriaged,
    lastAuditRun,
  };

  const features = buildFeatures({ storeId, settings: settingsMap, counts });

  // ── LLM Usage ───────────────────────────────────────────────────────────────
  const totalCostUsd =
    usageLogs._sum?.costUsd != null
      ? usageLogs._sum.costUsd
      : user.trialCreditUsed ?? 0;

  const byFeature = usageByFeature.map((row) => ({
    feature: row.feature,
    costUsd: row._sum?.costUsd ?? 0,
    tokensIn: row._sum?.tokensIn ?? 0,
    tokensOut: row._sum?.tokensOut ?? 0,
  }));

  const trialLimit = 10.0;

  return data({
    user: {
      name: user.name,
      email: user.email,
      plan: user.plan,
      role: user.role,
      trialCreditUsed: user.trialCreditUsed,
      trialEndsAt: user.trialEndsAt,
    },
    shopDomain,
    stats: {
      productsTotal,
      productsTagged,
      productsAudited,
      avgSeoScore,
      scoreDistribution: {
        good: goodCount,
        warning: warningCount,
        critical: criticalCount,
      },
      keywordsTotal,
      keywordsWithVolume,
      collectionsCreated,
      articlesTotal,
      articlesPublished,
      redirectsPending,
      redirectsApplied,
      proposalsTotal,
      proposalsApplied,
      llmsTxtScore: llmsTxtRecord?.score ?? 0,
      gscKeywordsTriaged,
    },
    features,
    setup,
    activeJob,
    llmUsage: {
      totalCostUsd,
      trialLimit,
      byFeature,
    },
  });
}

// ── Feature definitions ────────────────────────────────────────────────────────
function buildFeatures({ storeId, settings, counts }) {
  const {
    productsAudited = 0,
    productsTagged = 0,
    keywordsTotal = 0,
    articlesTotal = 0,
    llmsTxtRecord = null,
    redirectsPending = 0,
    redirectsApplied = 0,
    gscKeywordsTriaged = 0,
    lastAuditRun = null,
  } = counts;

  const redirectsTotal = (redirectsPending ?? 0) + (redirectsApplied ?? 0);

  const hasSetting = (key) => !!settings[key];

  const features = [
    {
      id: "onpage_audit",
      label: "On-Page Audit",
      href: "/app/onpage",
      category: "core",
      used: productsAudited > 0,
      count: productsAudited,
      countLabel: "produse auditate",
      lastRun: lastAuditRun,
    },
    {
      id: "seo_engine",
      label: "SEO Engine",
      href: "/app/seo-engine",
      category: "core",
      used: productsTagged > 0,
      count: productsTagged,
      countLabel: "produse taguite",
      lastRun: null,
    },
    {
      id: "keywords",
      label: "Keywords & Colecții",
      href: "/app/keywords",
      category: "core",
      used: keywordsTotal > 0,
      count: keywordsTotal,
      countLabel: "keywords generate",
      lastRun: null,
    },
    {
      id: "blog",
      label: "Blog Generator",
      href: "/app/blog",
      category: "content",
      used: articlesTotal > 0,
      count: articlesTotal,
      countLabel: "articole generate",
      lastRun: null,
    },
    {
      id: "llmstxt",
      label: "LLMs.txt",
      href: "/app/llmstxt",
      category: "ai",
      used: llmsTxtRecord !== null,
      count: llmsTxtRecord?.score ?? 0,
      countLabel: "scor completitudine",
      lastRun: null,
    },
    {
      id: "redirects",
      label: "Redirect Manager",
      href: "/app/redirects",
      category: "technical",
      used: redirectsTotal > 0,
      count: redirectsTotal,
      countLabel: "redirecturi detectate",
      lastRun: null,
    },
    {
      id: "robots",
      label: "Robots.txt Audit",
      href: "/app/robots",
      category: "technical",
      used: hasSetting("robots_audit_result"),
      count: hasSetting("robots_audit_result") ? 1 : 0,
      countLabel: "audituri efectuate",
      lastRun: null,
    },
    {
      id: "faq",
      label: "FAQ / PAA",
      href: "/app/faq",
      category: "content",
      used: hasSetting("paa_batch_done"),
      count: hasSetting("paa_batch_done") ? 1 : 0,
      countLabel: "batch-uri procesate",
      lastRun: null,
    },
    {
      id: "ga4",
      label: "GA4 Analytics",
      href: "/app/ga4",
      category: "analytics",
      used: hasSetting("ga4_property_id"),
      count: hasSetting("ga4_property_id") ? 1 : 0,
      countLabel: "proprietăți conectate",
      lastRun: null,
    },
    {
      id: "content_decay",
      label: "Content Decay",
      href: "/app/content-decay",
      category: "analytics",
      used: hasSetting("content_decay_results"),
      count: hasSetting("content_decay_results") ? 1 : 0,
      countLabel: "analize efectuate",
      lastRun: null,
    },
    {
      id: "llm_sentiment",
      label: "LLM Sentiment",
      href: "/app/llm-sentiment",
      category: "ai",
      used: hasSetting("llm_sentiment_results"),
      count: hasSetting("llm_sentiment_results") ? 1 : 0,
      countLabel: "analize efectuate",
      lastRun: null,
    },
    {
      id: "brand_serp",
      label: "Brand SERP",
      href: "/app/brand-serp",
      category: "analytics",
      used: hasSetting("brand_serp_results"),
      count: hasSetting("brand_serp_results") ? 1 : 0,
      countLabel: "analize efectuate",
      lastRun: null,
    },
    {
      id: "competitor_gap",
      label: "Competitor Gap",
      href: "/app/competitor-gap",
      category: "analytics",
      used: hasSetting("competitor_gap_results"),
      count: hasSetting("competitor_gap_results") ? 1 : 0,
      countLabel: "analize efectuate",
      lastRun: null,
    },
    {
      id: "cannibalization",
      label: "Keyword Cannibalization",
      href: "/app/cannibalization",
      category: "analytics",
      used: hasSetting("cannibalization_results"),
      count: hasSetting("cannibalization_results") ? 1 : 0,
      countLabel: "analize efectuate",
      lastRun: null,
    },
    {
      id: "cwv",
      label: "Core Web Vitals",
      href: "/app/cwv",
      category: "technical",
      used: hasSetting("cwv_results"),
      count: hasSetting("cwv_results") ? 1 : 0,
      countLabel: "analize efectuate",
      lastRun: null,
    },
    {
      id: "crawl_budget",
      label: "Crawl Budget",
      href: "/app/crawl-budget",
      category: "technical",
      used: hasSetting("crawl_budget_results"),
      count: hasSetting("crawl_budget_results") ? 1 : 0,
      countLabel: "analize efectuate",
      lastRun: null,
    },
    {
      id: "intent_shift",
      label: "Intent Shift",
      href: "/app/intent-shift",
      category: "analytics",
      used: hasSetting("intent_shift_results"),
      count: hasSetting("intent_shift_results") ? 1 : 0,
      countLabel: "analize efectuate",
      lastRun: null,
    },
    {
      id: "citation_monitor",
      label: "Citation Monitor",
      href: "/app/citation-monitor",
      category: "ai",
      used: hasSetting("citation_results"),
      count: hasSetting("citation_results") ? 1 : 0,
      countLabel: "monitorizări efectuate",
      lastRun: null,
    },
    {
      id: "bing_ai",
      label: "Bing AI Answers",
      href: "/app/bing-ai",
      category: "ai",
      used: hasSetting("bing_ai_results"),
      count: hasSetting("bing_ai_results") ? 1 : 0,
      countLabel: "analize efectuate",
      lastRun: null,
    },
    {
      id: "gsc_triage",
      label: "GSC Keyword Triage",
      href: "/app/gsc-triage",
      category: "analytics",
      used: gscKeywordsTriaged > 0,
      count: gscKeywordsTriaged,
      countLabel: "keywords analizate",
      lastRun: null,
    },
  ];

  return features;
}
