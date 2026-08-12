// app/lib/seo/ctr-anomaly.server.js
// Sprint 4 — CTR Anomaly Detector
//
// Compares actual CTR from GSC against expected CTR at position.
// ratio < 0.5 → CRITICAL (meta title/desc needs work)
// ratio > 2.0 → INFO (branded/high-intent query, protect it)

import prisma from "../../db.server.js";
import { CTR_CURVE, ctrAtPosition } from "./ecs-scorer.server.js";
import { createAlert, autoResolveAlertsFor, ALERT_TYPES, ALERT_SEVERITY } from "./alerts.server.js";

const MIN_IMPRESSIONS = 50;  // skip low-data queries
const LOW_CTR_RATIO   = 0.5;
const HIGH_CTR_RATIO  = 2.0;

export async function detectCtrAnomalies(storeId) {
  // Get latest GSC snapshot
  const latest = await prisma.seoGscData.findFirst({
    where: { storeId },
    orderBy: { dateRangeStart: "desc" },
    select: { dateRangeStart: true },
  });
  if (!latest) return { scanned: 0, anomalies: 0 };

  const gscRows = await prisma.seoGscData.findMany({
    where: {
      storeId,
      dateRangeStart: latest.dateRangeStart,
      impressions: { gte: MIN_IMPRESSIONS },
    },
    select: {
      id: true, productId: true, pageUrl: true, query: true,
      impressions: true, clicks: true, position: true, ctr: true,
    },
  });

  let anomalies = 0;

  for (const row of gscRows) {
    if (!row.position || row.position <= 0) continue;
    const expectedCtr = ctrAtPosition(row.position);
    const actualCtr   = row.ctr || 0;
    const ratio = expectedCtr > 0 ? actualCtr / expectedCtr : 1;

    if (ratio < LOW_CTR_RATIO && row.position <= 15) {
      // CTR far below expected — meta title/description likely bad
      await createAlert({
        storeId,
        type:        ALERT_TYPES.CTR_ANOMALY,
        severity:    ALERT_SEVERITY.CRITICAL,
        subjectKind: row.productId ? "product" : "page",
        subjectId:   row.productId || row.pageUrl,
        title:       `Low CTR: "${row.query}" at pos ${Math.round(row.position)}`,
        description: `Query "${row.query}" has ${row.impressions} impressions at position ${Math.round(row.position * 10) / 10} but CTR is only ${(actualCtr * 100).toFixed(1)}% (expected ${(expectedCtr * 100).toFixed(1)}%). Meta title/description may need optimization.`,
        metadata: {
          query: row.query, pageUrl: row.pageUrl,
          position: row.position, actualCtr, expectedCtr, ratio,
          impressions: row.impressions, clicks: row.clicks,
        },
      });
      anomalies++;
    } else if (ratio > HIGH_CTR_RATIO && row.clicks >= 5) {
      // CTR above expected — branded or high-intent, protect it
      await createAlert({
        storeId,
        type:        ALERT_TYPES.CTR_ANOMALY,
        severity:    ALERT_SEVERITY.INFO,
        subjectKind: row.productId ? "product" : "page",
        subjectId:   row.productId || row.pageUrl,
        title:       `High CTR: "${row.query}" at pos ${Math.round(row.position)}`,
        description: `Query "${row.query}" has CTR ${(actualCtr * 100).toFixed(1)}% at position ${Math.round(row.position * 10) / 10} — ${(ratio).toFixed(1)}× expected. This is likely a branded or high-intent query. Protect this ranking.`,
        metadata: {
          query: row.query, pageUrl: row.pageUrl,
          position: row.position, actualCtr, expectedCtr, ratio,
          impressions: row.impressions, clicks: row.clicks,
        },
      });
      anomalies++;
    }
  }

  return { scanned: gscRows.length, anomalies };
}
