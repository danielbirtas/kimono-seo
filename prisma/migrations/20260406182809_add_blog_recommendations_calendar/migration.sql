-- AlterTable
ALTER TABLE "BlogArticle" ADD COLUMN     "scheduledDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BlogRecommendation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "primaryKeyword" TEXT NOT NULL,
    "supportingKeywords" TEXT NOT NULL DEFAULT '[]',
    "articleType" TEXT NOT NULL DEFAULT 'pillar',
    "targetWordCount" INTEGER NOT NULL DEFAULT 2200,
    "brandVoice" TEXT NOT NULL DEFAULT 'conversational_expert',
    "rationale" TEXT NOT NULL DEFAULT '',
    "priorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedImpact" TEXT NOT NULL DEFAULT 'medium',
    "suggestedDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "articleId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlogRecommendation_storeId_status_idx" ON "BlogRecommendation"("storeId", "status");

-- CreateIndex
CREATE INDEX "BlogRecommendation_storeId_priorityScore_idx" ON "BlogRecommendation"("storeId", "priorityScore");

-- CreateIndex
CREATE INDEX "BlogArticle_storeId_scheduledDate_idx" ON "BlogArticle"("storeId", "scheduledDate");

-- AddForeignKey
ALTER TABLE "BlogRecommendation" ADD CONSTRAINT "BlogRecommendation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
