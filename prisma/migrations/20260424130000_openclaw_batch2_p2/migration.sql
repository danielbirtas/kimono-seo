-- OpenClaw Batch 2 (P2): M13 Zero-Click · M27 Answer Confidence

-- M13 Zero-Click
CREATE TABLE "SeoZeroClickOpt" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "serpFeature" TEXT NOT NULL,
    "competitorUrl" TEXT,
    "competitorText" TEXT,
    "recommendedText" TEXT,
    "recommendedFormat" TEXT,
    "applicableUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SeoZeroClickOpt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SeoZeroClickOpt_storeId_keyword_idx"  ON "SeoZeroClickOpt"("storeId", "keyword");
CREATE INDEX "SeoZeroClickOpt_storeId_status_idx"   ON "SeoZeroClickOpt"("storeId", "status");
ALTER TABLE "SeoZeroClickOpt" ADD CONSTRAINT "SeoZeroClickOpt_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- M27 Answer Confidence
CREATE TABLE "SeoAnswerConfidence" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceTitle" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "contentHash" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeoAnswerConfidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeoAnswerConfidence_storeId_sourceType_sourceId_contentHash_key"
  ON "SeoAnswerConfidence"("storeId", "sourceType", "sourceId", "contentHash");
CREATE INDEX "SeoAnswerConfidence_storeId_overallScore_idx" ON "SeoAnswerConfidence"("storeId", "overallScore");
ALTER TABLE "SeoAnswerConfidence" ADD CONSTRAINT "SeoAnswerConfidence_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
