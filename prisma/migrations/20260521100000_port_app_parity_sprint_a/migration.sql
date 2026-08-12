-- ============================================================
-- Sprint A — Port paritate Shopify app Kimono OpenSEO → standalone
-- Adaugă 13 modele noi + extinde Store + SeoAudit cu entity fields
-- Date: 2026-05-21
-- ============================================================

-- 1) Store: Knowledge Graph anchors (Organization.sameAs)
ALTER TABLE "Store"
  ADD COLUMN "wikidataQid"  TEXT,
  ADD COLUMN "wikipediaUrl" TEXT,
  ADD COLUMN "gbpUrl"       TEXT;

-- 2) SeoAudit: entity-score metrics (Wave 1 GEO)
ALTER TABLE "SeoAudit"
  ADD COLUMN "entityScore"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "entityCount"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "entityDensity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "entityList"    TEXT NOT NULL DEFAULT '[]';

-- 3) FanOutSession (Wave 3 — query fan-out coverage)
CREATE TABLE "FanOutSession" (
  "id"             TEXT NOT NULL,
  "storeId"        TEXT NOT NULL,
  "primaryKeyword" TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "queries"        TEXT NOT NULL DEFAULT '[]',
  "totalQueries"   INTEGER NOT NULL DEFAULT 0,
  "coveredCount"   INTEGER NOT NULL DEFAULT 0,
  "errorMessage"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FanOutSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FanOutSession_storeId_createdAt_idx" ON "FanOutSession"("storeId", "createdAt" DESC);
ALTER TABLE "FanOutSession" ADD CONSTRAINT "FanOutSession_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) SeoAuthor (Wave 1 — Person schema author profiles)
CREATE TABLE "SeoAuthor" (
  "id"           TEXT NOT NULL,
  "storeId"      TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "role"         TEXT,
  "bio"          TEXT,
  "avatarUrl"    TEXT,
  "wikipediaUrl" TEXT,
  "wikidataQid"  TEXT,
  "linkedinUrl"  TEXT,
  "twitterUrl"   TEXT,
  "websiteUrl"   TEXT,
  "credentials"  TEXT NOT NULL DEFAULT '[]',
  "isDefault"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SeoAuthor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SeoAuthor_storeId_idx" ON "SeoAuthor"("storeId");
CREATE UNIQUE INDEX "SeoAuthor_storeId_name_key" ON "SeoAuthor"("storeId", "name");
ALTER TABLE "SeoAuthor" ADD CONSTRAINT "SeoAuthor_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) ScheduledPin (Pinterest auto-post queue)
CREATE TABLE "ScheduledPin" (
  "id"             TEXT NOT NULL,
  "storeId"        TEXT NOT NULL,
  "scheduledFor"   TIMESTAMP(3) NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "boardId"        TEXT NOT NULL,
  "boardName"      TEXT,
  "imageUrl"       TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "description"    TEXT NOT NULL,
  "altText"        TEXT,
  "link"           TEXT NOT NULL,
  "source"         TEXT NOT NULL DEFAULT 'manual',
  "productId"      TEXT,
  "productTitle"   TEXT,
  "pinterestPinId" TEXT,
  "errorMessage"   TEXT,
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "postedAt"       TIMESTAMP(3),
  CONSTRAINT "ScheduledPin_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScheduledPin_storeId_status_scheduledFor_idx" ON "ScheduledPin"("storeId", "status", "scheduledFor");
CREATE INDEX "ScheduledPin_status_scheduledFor_idx"          ON "ScheduledPin"("status", "scheduledFor");
ALTER TABLE "ScheduledPin" ADD CONSTRAINT "ScheduledPin_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6) WebhookDedupe (idempotency Shopify retries)
CREATE TABLE "WebhookDedupe" (
  "id"          TEXT NOT NULL,
  "topic"       TEXT,
  "shopDomain"  TEXT,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookDedupe_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WebhookDedupe_processedAt_idx" ON "WebhookDedupe"("processedAt");

-- 7) AiBrandConfig (AI Citations Sprint 3)
CREATE TABLE "AiBrandConfig" (
  "id"                    TEXT NOT NULL,
  "storeId"               TEXT NOT NULL,
  "brandName"             TEXT NOT NULL,
  "aliases"               TEXT NOT NULL DEFAULT '[]',
  "domains"               TEXT NOT NULL DEFAULT '[]',
  "competitors"           TEXT NOT NULL DEFAULT '[]',
  "scheduleFrequency"     TEXT NOT NULL DEFAULT 'off',
  "scheduleRunsPerPrompt" INTEGER NOT NULL DEFAULT 3,
  "lastScheduledScanAt"   TIMESTAMP(3),
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiBrandConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiBrandConfig_storeId_key" ON "AiBrandConfig"("storeId");
ALTER TABLE "AiBrandConfig" ADD CONSTRAINT "AiBrandConfig_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8) AiPrompt
CREATE TABLE "AiPrompt" (
  "id"        TEXT NOT NULL,
  "storeId"   TEXT NOT NULL,
  "text"      TEXT NOT NULL,
  "intent"    TEXT,
  "cluster"   TEXT,
  "status"    TEXT NOT NULL DEFAULT 'active',
  "source"    TEXT NOT NULL DEFAULT 'manual',
  "textHash"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastRunAt" TIMESTAMP(3),
  CONSTRAINT "AiPrompt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiPrompt_storeId_textHash_key" ON "AiPrompt"("storeId", "textHash");
CREATE INDEX "AiPrompt_storeId_status_idx" ON "AiPrompt"("storeId", "status");
ALTER TABLE "AiPrompt" ADD CONSTRAINT "AiPrompt_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 9) AiCitationScan
CREATE TABLE "AiCitationScan" (
  "id"                TEXT NOT NULL,
  "storeId"           TEXT NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'RUNNING',
  "startedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"        TIMESTAMP(3),
  "platforms"         TEXT NOT NULL DEFAULT '[]',
  "runsPerPrompt"     INTEGER NOT NULL DEFAULT 3,
  "promptCount"       INTEGER NOT NULL DEFAULT 0,
  "totalRuns"         INTEGER NOT NULL DEFAULT 0,
  "totalCitations"    INTEGER NOT NULL DEFAULT 0,
  "brandMentions"     INTEGER NOT NULL DEFAULT 0,
  "brandCitationRate" DOUBLE PRECISION,
  "costCents"         INTEGER NOT NULL DEFAULT 0,
  "errorMessage"      TEXT,
  CONSTRAINT "AiCitationScan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiCitationScan_storeId_startedAt_idx" ON "AiCitationScan"("storeId", "startedAt");
ALTER TABLE "AiCitationScan" ADD CONSTRAINT "AiCitationScan_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 10) AiCitationRun
CREATE TABLE "AiCitationRun" (
  "id"                   TEXT NOT NULL,
  "scanId"               TEXT NOT NULL,
  "promptId"             TEXT NOT NULL,
  "platform"             TEXT NOT NULL,
  "model"                TEXT,
  "runIndex"             INTEGER NOT NULL DEFAULT 0,
  "rawResponse"          JSONB NOT NULL,
  "responseText"         TEXT NOT NULL,
  "brandMentioned"       BOOLEAN NOT NULL DEFAULT false,
  "brandPosition"        INTEGER,
  "mentionCount"         INTEGER NOT NULL DEFAULT 0,
  "competitorsMentioned" TEXT NOT NULL DEFAULT '[]',
  "costCents"            INTEGER NOT NULL DEFAULT 0,
  "durationMs"           INTEGER,
  "errorMessage"         TEXT,
  "ranAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCitationRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiCitationRun_scanId_platform_idx" ON "AiCitationRun"("scanId", "platform");
CREATE INDEX "AiCitationRun_promptId_platform_runIndex_idx" ON "AiCitationRun"("promptId", "platform", "runIndex");
ALTER TABLE "AiCitationRun" ADD CONSTRAINT "AiCitationRun_scanId_fkey"
  FOREIGN KEY ("scanId") REFERENCES "AiCitationScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCitationRun" ADD CONSTRAINT "AiCitationRun_promptId_fkey"
  FOREIGN KEY ("promptId") REFERENCES "AiPrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 11) AiCitation
CREATE TABLE "AiCitation" (
  "id"           TEXT NOT NULL,
  "runId"        TEXT NOT NULL,
  "url"          TEXT NOT NULL,
  "domain"       TEXT NOT NULL,
  "title"        TEXT,
  "position"     INTEGER,
  "isBrandOwned" BOOLEAN NOT NULL DEFAULT false,
  "snippetText"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiCitation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiCitation_runId_idx" ON "AiCitation"("runId");
CREATE INDEX "AiCitation_domain_idx" ON "AiCitation"("domain");
ALTER TABLE "AiCitation" ADD CONSTRAINT "AiCitation_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "AiCitationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 12) SeoAlert (SEO Brain Sprint 1.3 — unified alerting)
CREATE TABLE "SeoAlert" (
  "id"           TEXT NOT NULL,
  "storeId"      TEXT NOT NULL,
  "type"         TEXT NOT NULL,
  "severity"     TEXT NOT NULL,
  "subjectKind"  TEXT,
  "subjectId"    TEXT,
  "title"        TEXT NOT NULL,
  "description"  TEXT NOT NULL,
  "metadata"     JSONB NOT NULL DEFAULT '{}',
  "status"       TEXT NOT NULL DEFAULT 'open',
  "ignoredUntil" TIMESTAMP(3),
  "resolvedAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SeoAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SeoAlert_storeId_status_severity_idx" ON "SeoAlert"("storeId", "status", "severity");
CREATE INDEX "SeoAlert_storeId_type_status_idx" ON "SeoAlert"("storeId", "type", "status");
CREATE INDEX "SeoAlert_storeId_subjectKind_subjectId_idx" ON "SeoAlert"("storeId", "subjectKind", "subjectId");
ALTER TABLE "SeoAlert" ADD CONSTRAINT "SeoAlert_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 13) SeoDecisionLog (SEO Brain Sprint 1.4 — decision audit trail)
CREATE TABLE "SeoDecisionLog" (
  "id"           TEXT NOT NULL,
  "storeId"      TEXT NOT NULL,
  "decisionKind" TEXT NOT NULL,
  "subjectKind"  TEXT,
  "subjectId"    TEXT,
  "inputs"       JSONB NOT NULL,
  "output"       JSONB NOT NULL,
  "rationale"    TEXT,
  "supersededBy" TEXT,
  "decidedBy"    TEXT NOT NULL DEFAULT 'auto_v1',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeoDecisionLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SeoDecisionLog_storeId_decisionKind_createdAt_idx" ON "SeoDecisionLog"("storeId", "decisionKind", "createdAt");
CREATE INDEX "SeoDecisionLog_storeId_subjectKind_subjectId_idx" ON "SeoDecisionLog"("storeId", "subjectKind", "subjectId");
ALTER TABLE "SeoDecisionLog" ADD CONSTRAINT "SeoDecisionLog_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 14) SeoAiExtractCache (cross-store AI dedup cache — 98% savings)
CREATE TABLE "SeoAiExtractCache" (
  "id"          TEXT NOT NULL,
  "clusterHash" TEXT NOT NULL,
  "sampleTitle" TEXT NOT NULL,
  "language"    TEXT NOT NULL DEFAULT 'ro',
  "candidates"  JSONB NOT NULL,
  "aiModel"     TEXT NOT NULL,
  "hitCount"    INTEGER NOT NULL DEFAULT 0,
  "promptHash"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SeoAiExtractCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SeoAiExtractCache_clusterHash_key" ON "SeoAiExtractCache"("clusterHash");
CREATE INDEX "SeoAiExtractCache_clusterHash_idx" ON "SeoAiExtractCache"("clusterHash");
CREATE INDEX "SeoAiExtractCache_expiresAt_idx" ON "SeoAiExtractCache"("expiresAt");

-- 15) SeoGscData (GSC ground-truth per page+query)
CREATE TABLE "SeoGscData" (
  "id"             TEXT NOT NULL,
  "storeId"        TEXT NOT NULL,
  "productId"      TEXT NOT NULL,
  "pageUrl"        TEXT NOT NULL,
  "query"          TEXT NOT NULL,
  "impressions"    INTEGER NOT NULL DEFAULT 0,
  "clicks"         INTEGER NOT NULL DEFAULT 0,
  "position"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ctr"            DOUBLE PRECISION NOT NULL DEFAULT 0,
  "dateRangeStart" TIMESTAMP(3) NOT NULL,
  "dateRangeEnd"   TIMESTAMP(3) NOT NULL,
  "syncedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeoGscData_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SeoGscData_storeId_pageUrl_query_dateRangeStart_key" ON "SeoGscData"("storeId", "pageUrl", "query", "dateRangeStart");
CREATE INDEX "SeoGscData_storeId_productId_idx" ON "SeoGscData"("storeId", "productId");
CREATE INDEX "SeoGscData_storeId_pageUrl_idx" ON "SeoGscData"("storeId", "pageUrl");
CREATE INDEX "SeoGscData_storeId_syncedAt_idx" ON "SeoGscData"("storeId", "syncedAt");
ALTER TABLE "SeoGscData" ADD CONSTRAINT "SeoGscData_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
