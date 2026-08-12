// app/lib/seo/alerts.server.js
//
// Unified alert system for SEO Brain. Used by Taxonomy Engine, On-Page ECS,
// GSC Sync, and any future analyzer that needs to surface a recommendation
// to the merchant. Single API: createAlert / resolveAlert / dismissAlert.
//
// Design principles:
// - Dedupe: if same (storeId, type, subjectId) alert is already open, we
//   UPDATE the description/metadata instead of creating a new row. Prevents
//   alert spam on weekly cron re-runs.
// - Auto-resolve: when the condition that triggered the alert disappears,
//   the caller is expected to call resolveAlert(). E.g. when cluster gets
//   split, the split-recommendation alert auto-resolves.
// - 30-day dismissal: dismissed alerts don't reappear for 30 days even if
//   the underlying condition still holds.

import prisma from "../../db.server.js";

const TYPES = {
  CLUSTER_SPLIT:      "cluster_split",
  DUPLICATE:          "duplicate",
  KEYWORD_CHANGE:     "keyword_change",
  CTR_ANOMALY:        "ctr_anomaly",
  TAXONOMY_MISMATCH:  "taxonomy_mismatch",
};

const SEVERITY = {
  CRITICAL: "critical",
  WARNING:  "warning",
  INFO:     "info",
};

const STATUS = {
  OPEN:          "open",
  APPLIED:       "applied",
  IGNORED:       "ignored",
  DISMISSED:     "dismissed",
  AUTO_RESOLVED: "auto_resolved",
};

export const ALERT_TYPES    = TYPES;
export const ALERT_SEVERITY = SEVERITY;
export const ALERT_STATUS   = STATUS;

// Upsert pattern — dedup by (storeId, type, subjectKind, subjectId).
// If an alert is already open for the same subject, update it; otherwise create new.
// Returns { alert, created } where created is true for new rows.
export async function createAlert({ storeId, type, severity, subjectKind, subjectId, title, description, metadata = {} }) {
  // Check for existing open alert on this subject + type
  const existing = subjectId
    ? await prisma.seoAlert.findFirst({
        where: {
          storeId,
          type,
          subjectKind,
          subjectId,
          status: { in: [STATUS.OPEN, STATUS.IGNORED] },
          OR: [
            { ignoredUntil: null },
            { ignoredUntil: { lt: new Date() } },
          ],
        },
      })
    : null;

  if (existing) {
    // Update existing alert with fresh data, reopen if it was ignored and the ignore window expired
    const alert = await prisma.seoAlert.update({
      where: { id: existing.id },
      data: {
        severity,
        title,
        description,
        metadata,
        status: STATUS.OPEN,
        ignoredUntil: null,
      },
    });
    return { alert, created: false };
  }

  // Block: don't recreate if alert was dismissed within ignoredUntil window
  if (subjectId) {
    const ignored = await prisma.seoAlert.findFirst({
      where: {
        storeId,
        type,
        subjectKind,
        subjectId,
        status: STATUS.IGNORED,
        ignoredUntil: { gte: new Date() },
      },
    });
    if (ignored) {
      return { alert: ignored, created: false, skipped: "ignored" };
    }
  }

  const alert = await prisma.seoAlert.create({
    data: { storeId, type, severity, subjectKind, subjectId, title, description, metadata },
  });
  return { alert, created: true };
}

export async function resolveAlert(alertId, { reason, autoResolved = false } = {}) {
  return prisma.seoAlert.update({
    where: { id: alertId },
    data: {
      status: autoResolved ? STATUS.AUTO_RESOLVED : STATUS.APPLIED,
      resolvedAt: new Date(),
      metadata: { reason: reason || null },
    },
  });
}

// Auto-resolve all open alerts matching subject + type. Called when the
// underlying condition disappears (e.g. cluster was split, products were merged).
export async function autoResolveAlertsFor({ storeId, type, subjectKind, subjectId, reason }) {
  return prisma.seoAlert.updateMany({
    where: {
      storeId,
      type,
      subjectKind,
      subjectId,
      status: { in: [STATUS.OPEN, STATUS.IGNORED] },
    },
    data: {
      status: STATUS.AUTO_RESOLVED,
      resolvedAt: new Date(),
    },
  });
}

export async function dismissAlert(alertId, { ignoreDays = 30 } = {}) {
  const ignoredUntil = ignoreDays > 0 ? new Date(Date.now() + ignoreDays * 24 * 60 * 60 * 1000) : null;
  return prisma.seoAlert.update({
    where: { id: alertId },
    data: {
      status: ignoredUntil ? STATUS.IGNORED : STATUS.DISMISSED,
      ignoredUntil,
    },
  });
}

// Counters for dashboard widget
export async function getAlertCounts(storeId) {
  const all = await prisma.seoAlert.groupBy({
    by:  ["severity", "status"],
    where: { storeId, status: STATUS.OPEN },
    _count: { _all: true },
  });
  const counts = { critical: 0, warning: 0, info: 0, total: 0 };
  for (const row of all) {
    counts[row.severity] = row._count._all;
    counts.total += row._count._all;
  }
  return counts;
}

export async function listAlerts({ storeId, type, severity, status = STATUS.OPEN, limit = 50, offset = 0 } = {}) {
  return prisma.seoAlert.findMany({
    where: {
      storeId,
      ...(type && { type }),
      ...(severity && { severity }),
      ...(status && { status }),
    },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    take: limit,
    skip: offset,
  });
}
