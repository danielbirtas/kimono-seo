-- CreateTable
CREATE TABLE "SeoSchema" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productHandle" TEXT NOT NULL DEFAULT '',
    "schemaJson" TEXT NOT NULL,
    "schemaType" TEXT NOT NULL DEFAULT 'Product',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "appliedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoSchema_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeoSchema_storeId_status_idx" ON "SeoSchema"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SeoSchema_storeId_productId_key" ON "SeoSchema"("storeId", "productId");

-- AddForeignKey
ALTER TABLE "SeoSchema" ADD CONSTRAINT "SeoSchema_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
