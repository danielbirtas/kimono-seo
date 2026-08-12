-- ============================================================
-- Sprint F Bloc 1 — SEO Brain pipeline columns
-- Adaugă coloanele lipsă pentru title-normalizer, 5-source discovery, ECS, taxonomy L0
-- Date: 2026-05-21
-- ============================================================

-- 1) SeoProduct — Title Normalizer + Discovery state
ALTER TABLE "SeoProduct"
  ADD COLUMN "normalizedTitle"      TEXT,
  ADD COLUMN "normalizedTitleAt"    TIMESTAMP(3),
  ADD COLUMN "normalizedTitleHash"  TEXT,
  ADD COLUMN "discoveryAttemptedAt" TIMESTAMP(3);

CREATE INDEX "SeoProduct_storeId_discoveryAttemptedAt_idx"
  ON "SeoProduct"("storeId", "discoveryAttemptedAt");

-- 2) SeoCandidate — 5-source discovery + ECS scoring
ALTER TABLE "SeoCandidate"
  ADD COLUMN "discoverySource" TEXT,
  ADD COLUMN "ecsScore"        DOUBLE PRECISION,
  ADD COLUMN "ecsPosition"     DOUBLE PRECISION,
  ADD COLUMN "ecsAllocated"    BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "SeoCandidate_storeId_ecsScore_idx"     ON "SeoCandidate"("storeId", "ecsScore");
CREATE INDEX "SeoCandidate_storeId_ecsAllocated_idx" ON "SeoCandidate"("storeId", "ecsAllocated");

-- 3) SeoTaxonomyProposal — L0 Department (5-level hierarchy)
ALTER TABLE "SeoTaxonomyProposal"
  ADD COLUMN "categoryL0" TEXT;

CREATE INDEX "SeoTaxonomyProposal_storeId_categoryL0_idx"
  ON "SeoTaxonomyProposal"("storeId", "categoryL0");
