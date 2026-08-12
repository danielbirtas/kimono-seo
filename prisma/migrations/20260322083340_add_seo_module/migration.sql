-- CreateTable
CREATE TABLE "SeoProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "aiTag" TEXT,
    "aiSub" TEXT,
    "shopifyTagApplied" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoKeyword" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "parentTag" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "volume" INTEGER NOT NULL DEFAULT 0,
    "competition" TEXT,
    "cpcLow" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpcHigh" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kwType" TEXT NOT NULL DEFAULT 'transactional',
    "collectionCreated" BOOLEAN NOT NULL DEFAULT false,
    "collectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoSetting" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "SeoSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeoProduct_storeId_status_idx" ON "SeoProduct"("storeId", "status");

-- CreateIndex
CREATE INDEX "SeoProduct_storeId_aiTag_idx" ON "SeoProduct"("storeId", "aiTag");

-- CreateIndex
CREATE UNIQUE INDEX "SeoProduct_storeId_productId_key" ON "SeoProduct"("storeId", "productId");

-- CreateIndex
CREATE INDEX "SeoKeyword_storeId_parentTag_idx" ON "SeoKeyword"("storeId", "parentTag");

-- CreateIndex
CREATE INDEX "SeoKeyword_storeId_competition_idx" ON "SeoKeyword"("storeId", "competition");

-- CreateIndex
CREATE INDEX "SeoKeyword_storeId_collectionCreated_idx" ON "SeoKeyword"("storeId", "collectionCreated");

-- CreateIndex
CREATE UNIQUE INDEX "SeoSetting_storeId_key_key" ON "SeoSetting"("storeId", "key");

-- AddForeignKey
ALTER TABLE "SeoProduct" ADD CONSTRAINT "SeoProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoKeyword" ADD CONSTRAINT "SeoKeyword_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoSetting" ADD CONSTRAINT "SeoSetting_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
