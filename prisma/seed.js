// prisma/seed.js
// Creates the default SUPER_ADMIN account for Kimono SEO
// Usage: node prisma/seed.js
// Or:   npx prisma db seed

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ── Plan limits reference (used by middleware, not enforced here) ──
export const PLAN_LIMITS = {
  TRIAL: {
    label:          "Trial",
    priceUsd:       0,
    trialDays:      14,
    trialCreditUsd: 10.00,   // $10 LLM credit to test all features
    maxStores:      1,
    maxProducts:    100,
    blogArticles:   5,       // per month
    keywords:       200,     // enrichments per month
    features: [
      "onpage_audit", "seo_engine", "keywords", "blog_generate",
      "llmstxt", "redirects", "robots", "faq",
      "ga4", "content_decay", "llm_sentiment", "brand_serp",
      "competitor_gap", "cannibalization", "cwv", "crawl_budget",
      "intent_shift", "citation_monitor", "bing_ai",
    ],
    description: "Testează toate funcțiile cu un credit de $10 timp de 14 zile.",
  },
  STARTER: {
    label:          "Starter",
    priceUsd:       29,
    trialCreditUsd: 0,
    maxStores:      1,
    maxProducts:    500,
    blogArticles:   50,
    keywords:       1000,
    features: [
      "onpage_audit", "seo_engine", "keywords", "blog_generate",
      "llmstxt", "redirects", "robots", "faq", "ga4",
    ],
    description: "Perfect pentru magazine mici. 1 magazin, 500 produse, funcțiile core SEO.",
    highlight: false,
  },
  GROWTH: {
    label:          "Growth",
    priceUsd:       79,
    trialCreditUsd: 0,
    maxStores:      3,
    maxProducts:    5000,
    blogArticles:   200,
    keywords:       5000,
    features: [
      "onpage_audit", "seo_engine", "keywords", "blog_generate",
      "llmstxt", "redirects", "robots", "faq", "ga4",
      "content_decay", "llm_sentiment", "brand_serp",
      "cannibalization", "cwv", "crawl_budget",
    ],
    description: "Pentru magazine în creștere. 3 magazine, funcții avansate: Brand SERP, CWV, Cannibalization.",
    highlight: true,
  },
  AGENCY: {
    label:          "Agency",
    priceUsd:       199,
    trialCreditUsd: 0,
    maxStores:      15,
    maxProducts:    -1,      // unlimited
    blogArticles:   -1,
    keywords:       -1,
    features: [
      "onpage_audit", "seo_engine", "keywords", "blog_generate",
      "llmstxt", "redirects", "robots", "faq", "ga4",
      "content_decay", "llm_sentiment", "brand_serp",
      "competitor_gap", "cannibalization", "cwv", "crawl_budget",
      "intent_shift", "citation_monitor", "bing_ai",
    ],
    description: "Pentru agenții. 15 magazine, toate funcțiile, keyword-uri nelimitate, suport dedicat.",
    highlight: false,
  },
  ADMIN: {
    label:          "Admin",
    priceUsd:       0,
    trialCreditUsd: 0,
    maxStores:      -1,
    maxProducts:    -1,
    blogArticles:   -1,
    keywords:       -1,
    features: ["*"],
    description: "Acces intern complet, fără limite.",
  },
};

// ── LLM cost estimator (approximate) ──
export const LLM_COST = {
  "claude-sonnet-4-6":        { inPerM: 3.00,  outPerM: 15.00 },
  "claude-haiku-4-5-20251001":{ inPerM: 0.80,  outPerM: 4.00  },
  "claude-opus-4-6":          { inPerM: 15.00, outPerM: 75.00 },
};

export function calcCost(model, tokensIn, tokensOut) {
  const rates = LLM_COST[model] || LLM_COST["claude-sonnet-4-6"];
  return (tokensIn / 1_000_000) * rates.inPerM + (tokensOut / 1_000_000) * rates.outPerM;
}

// ── Seed ──
async function main() {
  const adminEmail    = process.env.ADMIN_EMAIL    || "admin@kimonogroup.ro";
  const adminPassword = process.env.ADMIN_PASSWORD || "KimonoSEO2026!";
  const adminName     = process.env.ADMIN_NAME     || "Kimono Admin";

  console.log(`\n🔧 Seeding admin user: ${adminEmail}`);

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where:  { email: adminEmail },
    update: {
      passwordHash,
      name:      adminName,
      role:      "SUPER_ADMIN",
      emailVerified: true,       // seeded admin can log in without the email-verify flow (no SMTP needed)
      plan:      "ADMIN",
      planStartedAt: new Date(),
      planEndsAt:    null,        // never expires
      trialEndsAt:   null,
    },
    create: {
      email:      adminEmail,
      passwordHash,
      name:       adminName,
      role:       "SUPER_ADMIN",
      emailVerified: true,       // seeded admin can log in without the email-verify flow (no SMTP needed)
      plan:       "ADMIN",
      planStartedAt: new Date(),
      planEndsAt:    null,
      trialEndsAt:   null,
    },
  });

  console.log(`✅ Admin user ready:`);
  console.log(`   ID:    ${admin.id}`);
  console.log(`   Email: ${admin.email}`);
  console.log(`   Role:  ${admin.role}`);
  console.log(`   Plan:  ${admin.plan}`);
  console.log(`   Pass:  ${adminPassword}`);
  console.log(`\n⚠  Schimbă parola după primul login!\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
