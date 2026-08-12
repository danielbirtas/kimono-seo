// app/lib/auth/plan-guard.server.js
// Enforces plan limits + logs LLM usage per user

import { PLAN_LIMITS, calcCost } from "../../../prisma/seed.js";

const TRIAL_CREDIT_LIMIT = 10.00; // $10 USD

/**
 * Check if a user can use a feature.
 * Throws a Response (403) if blocked.
 */
export async function guardFeature(prisma, user, feature) {
  if (user.role === "SUPER_ADMIN" || user.plan === "ADMIN") return; // unlimited

  const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.TRIAL;

  // Check if feature is allowed on this plan
  if (!limits.features.includes("*") && !limits.features.includes(feature)) {
    throw Response.json(
      { success: false, error: `Feature "${feature}" nu este disponibil pe planul ${limits.label}. Upgrade la Growth sau Agency.`, upgrade: true },
      { status: 403 }
    );
  }

  // Trial: check $10 credit limit
  if (user.plan === "TRIAL") {
    if ((user.trialCreditUsed || 0) >= TRIAL_CREDIT_LIMIT) {
      throw Response.json(
        { success: false, error: "Creditul de trial ($10) a fost epuizat. Alege un plan pentru a continua.", upgrade: true },
        { status: 402 }
      );
    }
    // Check trial expiry
    if (user.trialEndsAt && new Date() > user.trialEndsAt) {
      throw Response.json(
        { success: false, error: "Perioada de trial a expirat. Alege un plan pentru a continua.", upgrade: true },
        { status: 402 }
      );
    }
  }
}

/**
 * Log LLM usage after a successful API call.
 * Updates trialCreditUsed if on trial.
 */
export async function logUsage(prisma, userId, { feature, model, tokensIn, tokensOut, storeId }) {
  const costUsd = calcCost(model, tokensIn || 0, tokensOut || 0);

  await prisma.usageLog.create({
    data: { userId, feature, model, tokensIn: tokensIn || 0, tokensOut: tokensOut || 0, costUsd, storeId: storeId || null },
  });

  // Update trial credit counter
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, trialCreditUsed: true } });
  if (user?.plan === "TRIAL" && costUsd > 0) {
    await prisma.user.update({
      where: { id: userId },
      data:  { trialCreditUsed: { increment: costUsd } },
    });
  }

  return costUsd;
}

/**
 * Get usage summary for a user (for dashboard display).
 */
export async function getUsageSummary(prisma, userId) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { plan: true, trialCreditUsed: true, trialEndsAt: true },
  });
  if (!user) return null;

  const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.TRIAL;

  const logs = await prisma.usageLog.groupBy({
    by: ["feature"],
    where: { userId },
    _sum: { costUsd: true, tokensIn: true, tokensOut: true },
    _count: { id: true },
  });

  return {
    plan:            user.plan,
    planLabel:       limits.label,
    trialCredit:     TRIAL_CREDIT_LIMIT,
    trialUsed:       user.trialCreditUsed || 0,
    trialRemaining:  Math.max(0, TRIAL_CREDIT_LIMIT - (user.trialCreditUsed || 0)),
    trialEndsAt:     user.trialEndsAt,
    byFeature:       logs.map(l => ({
      feature:    l.feature,
      calls:      l._count.id,
      costUsd:    l._sum.costUsd,
      tokensIn:   l._sum.tokensIn,
      tokensOut:  l._sum.tokensOut,
    })),
  };
}
