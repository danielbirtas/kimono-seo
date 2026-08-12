/*
  Warnings:

  - You are about to drop the column `rfmRecencyDays` on the `StoreSettings` table. All the data in the column will be lost.
  - You are about to drop the column `rfmSegmentCount` on the `StoreSettings` table. All the data in the column will be lost.
  - You are about to drop the column `stockEmailTo` on the `StoreSettings` table. All the data in the column will be lost.
  - You are about to drop the column `stockLeadTimeDays` on the `StoreSettings` table. All the data in the column will be lost.
  - You are about to drop the column `stockThreshold` on the `StoreSettings` table. All the data in the column will be lost.
  - You are about to drop the column `stockVelocityDays` on the `StoreSettings` table. All the data in the column will be lost.
  - You are about to drop the `AiMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AiReport` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Cohort` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DashboardSnapshot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RfmSegment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockAlert` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'APPLIED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('SYNC', 'EXTRACT', 'ENRICH', 'TAXONOMY', 'AUDIT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "AiMessage" DROP CONSTRAINT "AiMessage_storeId_fkey";

-- DropForeignKey
ALTER TABLE "AiReport" DROP CONSTRAINT "AiReport_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Cohort" DROP CONSTRAINT "Cohort_storeId_fkey";

-- DropForeignKey
ALTER TABLE "DashboardSnapshot" DROP CONSTRAINT "DashboardSnapshot_storeId_fkey";

-- DropForeignKey
ALTER TABLE "RfmSegment" DROP CONSTRAINT "RfmSegment_storeId_fkey";

-- DropForeignKey
ALTER TABLE "StockAlert" DROP CONSTRAINT "StockAlert_storeId_fkey";

-- AlterTable
ALTER TABLE "StoreSettings" DROP COLUMN "rfmRecencyDays",
DROP COLUMN "rfmSegmentCount",
DROP COLUMN "stockEmailTo",
DROP COLUMN "stockLeadTimeDays",
DROP COLUMN "stockThreshold",
DROP COLUMN "stockVelocityDays",
ALTER COLUMN "aiModel" SET DEFAULT 'claude-sonnet-4-6';

-- DropTable
DROP TABLE "AiMessage";

-- DropTable
DROP TABLE "AiReport";

-- DropTable
DROP TABLE "Cohort";

-- DropTable
DROP TABLE "DashboardSnapshot";

-- DropTable
DROP TABLE "RfmSegment";

-- DropTable
DROP TABLE "StockAlert";

-- DropEnum
DROP TYPE "AlertSeverity";

-- DropEnum
DROP TYPE "AlertStatus";

-- DropEnum
DROP TYPE "ReportType";

-- CreateTable
CREATE TABLE "SeoSyncLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "totalProducts" INTEGER NOT NULL DEFAULT 0,
    "syncedProducts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SeoSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoCandidate" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "keywordNorm" TEXT NOT NULL,
    "volume" INTEGER,
    "difficulty" INTEGER,
    "cpc" DOUBLE PRECISION,
    "competition" TEXT,
    "serpFeatures" TEXT,
    "paaCount" INTEGER,
    "trend" TEXT,
    "score" DOUBLE PRECISION,
    "enrichedAt" TIMESTAMP(3),
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DfsCache" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "locationCode" INTEGER NOT NULL,
    "languageCode" TEXT NOT NULL,
    "volume" INTEGER NOT NULL DEFAULT 0,
    "difficulty" INTEGER NOT NULL DEFAULT 0,
    "cpc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "competition" TEXT NOT NULL DEFAULT 'LOW',
    "serpFeatures" TEXT NOT NULL DEFAULT '[]',
    "paaCount" INTEGER NOT NULL DEFAULT 0,
    "trend" TEXT NOT NULL DEFAULT '[]',
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DfsCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoTaxonomyProposal" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "categoryL1" TEXT NOT NULL,
    "categoryL2" TEXT NOT NULL,
    "categoryL3" TEXT,
    "currentTag" TEXT NOT NULL,
    "proposedTag" TEXT NOT NULL,
    "proposedHandle" TEXT NOT NULL,
    "currentVolume" INTEGER NOT NULL DEFAULT 0,
    "proposedVolume" INTEGER NOT NULL DEFAULT 0,
    "justification" TEXT NOT NULL,
    "affectedProductIds" TEXT NOT NULL DEFAULT '[]',
    "affectedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "appliedAt" TIMESTAMP(3),
    "appliedBy" TEXT,
    "oldHandle" TEXT,
    "newHandle" TEXT,
    "redirectCreated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoTaxonomyProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoAudit" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productHandle" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL DEFAULT 0,
    "metaTitleScore" INTEGER NOT NULL DEFAULT 0,
    "metaDescScore" INTEGER NOT NULL DEFAULT 0,
    "h1Score" INTEGER NOT NULL DEFAULT 0,
    "handleScore" INTEGER NOT NULL DEFAULT 0,
    "imageScore" INTEGER NOT NULL DEFAULT 100,
    "ogScore" INTEGER NOT NULL DEFAULT 100,
    "findings" TEXT NOT NULL DEFAULT '[]',
    "suggestions" TEXT NOT NULL DEFAULT '{}',
    "lastOptimizedAt" TIMESTAMP(3),
    "optimizedFields" TEXT NOT NULL DEFAULT '[]',
    "auditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoOptimizeSuggestion" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "currentValue" TEXT NOT NULL,
    "suggestedValue" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoOptimizeSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoJob" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "statusMessage" TEXT NOT NULL DEFAULT '',
    "cursor" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeoSyncLog_storeId_status_idx" ON "SeoSyncLog"("storeId", "status");

-- CreateIndex
CREATE INDEX "SeoSyncLog_startedAt_idx" ON "SeoSyncLog"("startedAt");

-- CreateIndex
CREATE INDEX "SeoCandidate_storeId_keyword_idx" ON "SeoCandidate"("storeId", "keyword");

-- CreateIndex
CREATE INDEX "SeoCandidate_storeId_score_idx" ON "SeoCandidate"("storeId", "score");

-- CreateIndex
CREATE INDEX "SeoCandidate_storeId_enrichedAt_idx" ON "SeoCandidate"("storeId", "enrichedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeoCandidate_storeId_productId_keywordNorm_key" ON "SeoCandidate"("storeId", "productId", "keywordNorm");

-- CreateIndex
CREATE INDEX "DfsCache_keyword_idx" ON "DfsCache"("keyword");

-- CreateIndex
CREATE INDEX "DfsCache_expiresAt_idx" ON "DfsCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DfsCache_keyword_locationCode_languageCode_key" ON "DfsCache"("keyword", "locationCode", "languageCode");

-- CreateIndex
CREATE INDEX "SeoTaxonomyProposal_storeId_status_idx" ON "SeoTaxonomyProposal"("storeId", "status");

-- CreateIndex
CREATE INDEX "SeoTaxonomyProposal_storeId_categoryL1_categoryL2_idx" ON "SeoTaxonomyProposal"("storeId", "categoryL1", "categoryL2");

-- CreateIndex
CREATE INDEX "SeoAudit_storeId_score_idx" ON "SeoAudit"("storeId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "SeoAudit_storeId_productId_key" ON "SeoAudit"("storeId", "productId");

-- CreateIndex
CREATE INDEX "SeoOptimizeSuggestion_storeId_status_idx" ON "SeoOptimizeSuggestion"("storeId", "status");

-- CreateIndex
CREATE INDEX "SeoOptimizeSuggestion_storeId_productId_idx" ON "SeoOptimizeSuggestion"("storeId", "productId");

-- CreateIndex
CREATE INDEX "SeoJob_storeId_status_idx" ON "SeoJob"("storeId", "status");

-- CreateIndex
CREATE INDEX "SeoJob_status_queuedAt_idx" ON "SeoJob"("status", "queuedAt");

-- AddForeignKey
ALTER TABLE "SeoSyncLog" ADD CONSTRAINT "SeoSyncLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoCandidate" ADD CONSTRAINT "SeoCandidate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoTaxonomyProposal" ADD CONSTRAINT "SeoTaxonomyProposal_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoAudit" ADD CONSTRAINT "SeoAudit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoOptimizeSuggestion" ADD CONSTRAINT "SeoOptimizeSuggestion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoJob" ADD CONSTRAINT "SeoJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
