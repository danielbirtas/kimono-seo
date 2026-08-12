-- CreateTable
CREATE TABLE "BlogCluster" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "primaryKeyword" TEXT NOT NULL,
    "supportingKeywords" TEXT NOT NULL DEFAULT '[]',
    "articleType" TEXT NOT NULL DEFAULT 'pillar',
    "intent" TEXT NOT NULL DEFAULT 'informational',
    "estimatedVolume" INTEGER NOT NULL DEFAULT 0,
    "priorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogArticle" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "clusterId" TEXT,
    "primaryKeyword" TEXT NOT NULL,
    "articleType" TEXT NOT NULL DEFAULT 'pillar',
    "targetWordCount" INTEGER NOT NULL DEFAULT 2200,
    "brandVoice" TEXT NOT NULL DEFAULT 'conversational_expert',
    "titleTag" TEXT NOT NULL DEFAULT '',
    "metaDescription" TEXT NOT NULL DEFAULT '',
    "urlSlug" TEXT NOT NULL DEFAULT '',
    "h1" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "faqSchema" TEXT NOT NULL DEFAULT '',
    "blogPostingSchema" TEXT NOT NULL DEFAULT '',
    "internalLinks" TEXT NOT NULL DEFAULT '[]',
    "imageBrief" TEXT NOT NULL DEFAULT '[]',
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "shopifyArticleId" TEXT,
    "errorMessage" TEXT,
    "generatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlogCluster_storeId_status_idx" ON "BlogCluster"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BlogCluster_storeId_primaryKeyword_key" ON "BlogCluster"("storeId", "primaryKeyword");

-- CreateIndex
CREATE INDEX "BlogArticle_storeId_status_idx" ON "BlogArticle"("storeId", "status");

-- CreateIndex
CREATE INDEX "BlogArticle_storeId_clusterId_idx" ON "BlogArticle"("storeId", "clusterId");

-- AddForeignKey
ALTER TABLE "BlogCluster" ADD CONSTRAINT "BlogCluster_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogArticle" ADD CONSTRAINT "BlogArticle_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogArticle" ADD CONSTRAINT "BlogArticle_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "BlogCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
