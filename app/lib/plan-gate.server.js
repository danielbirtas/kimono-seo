// app/lib/plan-gate.server.js
// Centralized plan gating — used from app.jsx loader so every /app/* sub-route
// is guarded by the same logic.

import { redirect } from "react-router";
import { canAccessModule, minimumPlanForModule } from "./billing.js";
import prisma from "../db.server.js";

// Map URL prefixes to module ids defined in PLANS.
// Order matters: longest prefix first when paths nest (e.g. /app/seo/keywords
// before /app/seo).
const URL_TO_MODULE = [
  ["/app/seo/keywords",      "keywords"],
  ["/app/seo/settings",      "seo"],
  ["/app/seo",               "seo"],
  ["/app/onpage",            "onpage"],
  ["/app/image-vision",      "image-vision"],
  ["/app/schema-validator",  "schema-validator"],
  ["/app/redirects",         "redirects"],
  ["/app/robots",            "robots"],
  ["/app/llmstxt",           "llmstxt"],
  ["/app/blog",              "blog"],
  ["/app/programmatic",      "programmatic"],
  ["/app/brand-serp",        "brand-serp"],
  ["/app/cwv",               "cwv"],
  ["/app/cannibalization",   "cannibalization"],
  ["/app/ga4",               "ga4"],
  ["/app/competitor-gap",    "competitor-gap"],
  ["/app/content-decay",     "content-decay"],
  ["/app/crawl-budget",      "crawl-budget"],
  ["/app/intent-shift",      "intent-shift"],
  ["/app/citation-monitor",  "citation-monitor"],
  ["/app/faq",               "faq"],
  ["/app/pinterest",         "pinterest"],
  ["/app/llm-sentiment",     "llm-sentiment"],
  ["/app/bing-ai",           "bing-ai"],
  ["/app/eeat",              "eeat"],
  ["/app/ai-citations",      "ai-citations"],
  ["/app/fan-out",           "fan-out"],
];

// Routes that are always accessible (no plan check)
const ALWAYS_ALLOWED = [
  "/app/billing",   // user must reach billing to upgrade
  "/app/settings",  // basic store settings always reachable
];

function moduleIdForPath(pathname) {
  // Skip /app exact / dashboard / always-allowed
  if (pathname === "/app" || pathname === "/app/")  return null;
  if (ALWAYS_ALLOWED.some(p => pathname.startsWith(p))) return null;
  for (const [prefix, mod] of URL_TO_MODULE) {
    if (pathname === prefix || pathname.startsWith(prefix + "/") || pathname.startsWith(prefix + "?")) {
      return mod;
    }
  }
  return null; // unknown route, allow
}

// Call from app.jsx loader. Returns { plan, moduleId } or throws a redirect
// to /app/billing if the merchant doesn't have access.
export async function gateCurrentRoute(request, shopDomain) {
  const url = new URL(request.url);
  const moduleId = moduleIdForPath(url.pathname);
  if (!moduleId) {
    return { plan: null, moduleId: null }; // route doesn't need gating
  }

  const store = await prisma.store.findUnique({
    where: { shopDomain },
    select: { plan: true },
  });
  const plan = store?.plan || "FREE";

  if (canAccessModule(plan, moduleId)) {
    return { plan, moduleId };
  }

  // Build upgrade redirect with context the billing page can read.
  const minPlan = minimumPlanForModule(moduleId);
  const params  = new URLSearchParams({
    upgrade: minPlan,
    module:  moduleId,
    from:    url.pathname,
  });
  throw redirect(`/app/billing?${params.toString()}`);
}
