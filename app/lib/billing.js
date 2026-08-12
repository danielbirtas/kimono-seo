// app/lib/billing.js — client-safe, no server imports
export const PLAN_STARTER = "Starter";
export const PLAN_GROWTH  = "Growth";
export const PLAN_SCALE   = "Scale";

// Module ids must match the URL_TO_MODULE map in plan-gate.server.js
export const PLANS = {
  FREE: {
    name: "Free", price: 0, color: "#6B7280",
    modules: ["onpage", "keywords", "redirects", "robots", "llmstxt"],
    limits: { productsAudit: 50, articlesMonth: 0, keywordsTracked: 10 },
    description: "Basic SEO tools for small stores",
  },
  STARTER: {
    name: "Starter", price: 49, color: "#6366F1", shopifyPlan: "Starter",
    modules: ["onpage", "keywords", "seo", "blog", "redirects", "robots",
              "llmstxt", "brand-serp", "cwv", "cannibalization", "ga4",
              "image-vision", "schema-validator"],
    limits: { productsAudit: 500, articlesMonth: 4, keywordsTracked: 100 },
    description: "Full SEO suite for growing stores",
  },
  GROWTH: {
    name: "Growth", price: 99, color: "#8B5CF6", shopifyPlan: "Growth",
    modules: ["onpage", "keywords", "seo", "blog", "redirects", "robots",
              "llmstxt", "brand-serp", "cwv", "cannibalization", "ga4",
              "image-vision", "schema-validator",
              "competitor-gap", "content-decay", "crawl-budget",
              "intent-shift", "citation-monitor", "faq", "pinterest",
              "llm-sentiment", "bing-ai", "eeat", "programmatic"],
    limits: { productsAudit: 2000, articlesMonth: 8, keywordsTracked: 500 },
    description: "Advanced SEO + AEO + GEO for scaling stores",
  },
  SCALE: {
    name: "Scale", price: 199, color: "#EC4899", shopifyPlan: "Scale",
    modules: ["all"],
    limits: { productsAudit: -1, articlesMonth: 15, keywordsTracked: -1 },
    description: "Everything unlimited for enterprise stores",
  },
};

export function canAccessModule(plan, module) {
  const p = PLANS[plan] || PLANS.FREE;
  if (p.modules.includes("all")) return true;
  return p.modules.includes(module);
}

export function getUpgradePlan(currentPlan) {
  const order = ["FREE", "STARTER", "GROWTH", "SCALE"];
  const idx = order.indexOf(currentPlan);
  return idx < order.length - 1 ? order[idx + 1] : null;
}

// Find the cheapest plan that grants access to a module (for upgrade prompts)
export function minimumPlanForModule(module) {
  const order = ["FREE", "STARTER", "GROWTH", "SCALE"];
  for (const p of order) {
    if (canAccessModule(p, module)) return p;
  }
  return "SCALE";
}
