// app/lib/trial-limits.server.js
// Trial usage caps so a 7-day trial can be evaluated without becoming a free
// production tool. Limits are differentiated per plan tier (a SCALE trial gets
// a higher ceiling than a STARTER trial — buyer's deserve to feel "scale").

import prisma from "../db.server.js";

export const TRIAL_DAYS = 7;

// All limits are TOTAL counts during the 7-day trial window (not per-day).
// Keys must match the resource id passed to enforceTrialLimit.
export const TRIAL_LIMITS = {
  STARTER: {
    articles_generated:   1,
    programmatic_content: 5,
    programmatic_publish: 2,
    image_vision:        15,
    eeat_audits:          1,
    schema_spotcheck:     1,
    brand_serp_scans:     1,
    citation_monitor:     1,
    dfs_keyword_enrich:  25,
    faq_generations:      2,
    pinterest_pins:       2,
    onpage_products:     30,
    cwv_audits:           2,
    content_decay_scans:  1,
    crawl_budget_scans:   1,
    intent_shift_scans:   1,
    llm_sentiment_scans:  1,
    ai_citation_scans:    1,
    ai_prompt_gens:       2,
  },
  GROWTH: {
    articles_generated:   2,
    programmatic_content: 10,
    programmatic_publish: 5,
    image_vision:        30,
    eeat_audits:          2,
    schema_spotcheck:     2,
    brand_serp_scans:     2,
    citation_monitor:     2,
    dfs_keyword_enrich:  50,
    faq_generations:      3,
    pinterest_pins:       5,
    onpage_products:     50,
    cwv_audits:           5,
    content_decay_scans:  2,
    crawl_budget_scans:   2,
    intent_shift_scans:   2,
    llm_sentiment_scans:  2,
    ai_citation_scans:    3,
    ai_prompt_gens:       3,
  },
  SCALE: {
    articles_generated:   4,
    programmatic_content: 20,
    programmatic_publish: 10,
    image_vision:        60,
    eeat_audits:          3,
    schema_spotcheck:     5,
    brand_serp_scans:     4,
    citation_monitor:     3,
    dfs_keyword_enrich: 100,
    faq_generations:      5,
    pinterest_pins:      10,
    onpage_products:    100,
    cwv_audits:          10,
    content_decay_scans:  4,
    crawl_budget_scans:   4,
    intent_shift_scans:   4,
    llm_sentiment_scans:  4,
    ai_citation_scans:    8,
    ai_prompt_gens:       6,
  },
};

// Human-readable labels for UI / error messages
export const RESOURCE_LABELS = {
  articles_generated:   "blog articles",
  programmatic_content: "programmatic SEO content drafts",
  programmatic_publish: "programmatic SEO published pages",
  image_vision:         "image alt texts",
  eeat_audits:          "E-E-A-T audits",
  schema_spotcheck:     "schema spot-checks",
  brand_serp_scans:     "Brand SERP scans",
  citation_monitor:     "Citation monitor scans",
  dfs_keyword_enrich:   "keyword enrichments",
  faq_generations:      "FAQ generations",
  pinterest_pins:       "Pinterest pins",
  cwv_audits:           "Core Web Vitals audits",
  content_decay_scans:  "Content decay scans",
  crawl_budget_scans:   "Crawl budget scans",
  intent_shift_scans:   "Intent shift scans",
  llm_sentiment_scans:  "LLM sentiment scans",
  ai_citation_scans:    "AI Citation scans",
  ai_prompt_gens:       "AI prompt library generations",
  onpage_products:      "products in on-page audit",
};

function trialTier(plan) {
  if (plan === "STARTER" || plan === "GROWTH" || plan === "SCALE") return plan;
  return null; // FREE = no trial
}

export function getTrialState(store) {
  const tier = trialTier(store?.plan);
  if (!tier || !store?.trialStartedAt) {
    return { isInTrial: false, daysLeft: 0, tier: null, limits: null };
  }
  const elapsedMs = Date.now() - new Date(store.trialStartedAt).getTime();
  const totalMs   = TRIAL_DAYS * 86400000;
  if (elapsedMs >= totalMs) {
    return { isInTrial: false, daysLeft: 0, tier, limits: TRIAL_LIMITS[tier] };
  }
  const daysLeft = Math.max(0, Math.ceil((totalMs - elapsedMs) / 86400000));
  return { isInTrial: true, daysLeft, tier, limits: TRIAL_LIMITS[tier] };
}

async function readUsage(storeId, resource) {
  const row = await prisma.seoSetting.findUnique({
    where: { storeId_key: { storeId, key: `trial_usage_${resource}` } },
  });
  return parseInt(row?.value || "0", 10);
}

async function bumpUsage(storeId, resource, units) {
  const current = await readUsage(storeId, resource);
  await prisma.seoSetting.upsert({
    where:  { storeId_key: { storeId, key: `trial_usage_${resource}` } },
    update: { value: String(current + units) },
    create: { storeId, key: `trial_usage_${resource}`, value: String(current + units) },
  });
}

// Throws a TrialLimitError if the action would exceed the trial cap.
// Records usage immediately (best-effort — over-counting is preferable to
// under-counting when users hammer the same endpoint concurrently).
export async function enforceTrialLimit(storeId, resource, units = 1) {
  const store = await prisma.store.findUnique({
    where:  { id: storeId },
    select: { plan: true, trialStartedAt: true },
  });
  if (!store) return; // unknown store — let the caller handle auth
  const state = getTrialState(store);
  if (!state.isInTrial) return; // not in trial → plan limits handled elsewhere

  const limit = state.limits?.[resource];
  if (typeof limit !== "number") return; // unknown resource → allow

  const current = await readUsage(storeId, resource);
  if (current + units > limit) {
    const label = RESOURCE_LABELS[resource] || resource;
    const err = new Error(`Trial limit reached: ${current}/${limit} ${label} on the ${state.tier} trial. Continue with a paid plan.`);
    err.code  = "TRIAL_LIMIT";
    err.resource = resource;
    err.tier  = state.tier;
    err.used  = current;
    err.limit = limit;
    throw err;
  }

  await bumpUsage(storeId, resource, units);
}

// Read all usage counters for the store — used by UI banners.
export async function getTrialUsageMap(storeId, tier) {
  const limits = TRIAL_LIMITS[tier] || {};
  const keys = Object.keys(limits).map(r => `trial_usage_${r}`);
  if (keys.length === 0) return {};
  const rows = await prisma.seoSetting.findMany({
    where: { storeId, key: { in: keys } },
  });
  const out = {};
  for (const r of Object.keys(limits)) {
    const row = rows.find(x => x.key === `trial_usage_${r}`);
    out[r] = { used: parseInt(row?.value || "0", 10), limit: limits[r] };
  }
  return out;
}

// Called from /webhooks/app/subscription-update on the first ACTIVE event.
// Idempotent: only sets trialStartedAt if it isn't already set.
export async function markTrialStarted(shopDomain) {
  const store = await prisma.store.findUnique({ where: { shopDomain }, select: { id: true, trialStartedAt: true } });
  if (!store || store.trialStartedAt) return;
  await prisma.store.update({
    where: { id: store.id },
    data:  { trialStartedAt: new Date() },
  });
}
