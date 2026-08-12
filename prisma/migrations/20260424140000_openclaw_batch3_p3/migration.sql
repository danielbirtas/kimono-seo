-- OpenClaw Batch 3 (P3): M15 E-E-A-T · M17 Topical Authority · M05a 404 Detection

-- M15 E-E-A-T Audit
CREATE TABLE "SeoEEATAudit" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "experienceScore" INTEGER NOT NULL DEFAULT 0,
    "expertiseScore" INTEGER NOT NULL DEFAULT 0,
    "authoritativenessScore" INTEGER NOT NULL DEFAULT 0,
    "trustworthinessScore" INTEGER NOT NULL DEFAULT 0,
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "findings" JSONB NOT NULL DEFAULT '[]',
    "plan" JSONB NOT NULL DEFAULT '[]',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeoEEATAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SeoEEATAudit_storeId_runAt_idx" ON "SeoEEATAudit"("storeId", "runAt");
ALTER TABLE "SeoEEATAudit" ADD CONSTRAINT "SeoEEATAudit_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- M17 Topical Authority Map
CREATE TABLE "SeoTopicalMap" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "topics" JSONB NOT NULL DEFAULT '[]',
    "gaps" JSONB NOT NULL DEFAULT '[]',
    "editorialPlan" JSONB NOT NULL DEFAULT '[]',
    "competitors" JSONB NOT NULL DEFAULT '[]',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeoTopicalMap_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SeoTopicalMap_storeId_runAt_idx" ON "SeoTopicalMap"("storeId", "runAt");
ALTER TABLE "SeoTopicalMap" ADD CONSTRAINT "SeoTopicalMap_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- M05a 404 Detection
CREATE TABLE "Seo404Detection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 404,
    "referrers" JSONB NOT NULL DEFAULT '[]',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'open',
    "redirectedTo" TEXT,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "Seo404Detection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Seo404Detection_storeId_urlHash_key" ON "Seo404Detection"("storeId", "urlHash");
CREATE INDEX "Seo404Detection_storeId_status_idx" ON "Seo404Detection"("storeId", "status");
ALTER TABLE "Seo404Detection" ADD CONSTRAINT "Seo404Detection_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
