-- OpenClaw Batch 1 (P1): M14 Entity SEO · M03 Image Vision · M23 Schema Validator

-- M14 Entity SEO
CREATE TABLE "SeoEntityAudit" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "entities" JSONB NOT NULL DEFAULT '[]',
    "organizationJson" TEXT,
    "consistencyScore" INTEGER NOT NULL DEFAULT 0,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "appliedToTheme" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" TIMESTAMP(3),
    "lastAuditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SeoEntityAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeoEntityAudit_storeId_key" ON "SeoEntityAudit"("storeId");
CREATE INDEX "SeoEntityAudit_storeId_idx" ON "SeoEntityAudit"("storeId");
ALTER TABLE "SeoEntityAudit" ADD CONSTRAINT "SeoEntityAudit_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- M03 Image Vision
CREATE TABLE "SeoImageAlt" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePosition" INTEGER NOT NULL DEFAULT 0,
    "originalAlt" TEXT DEFAULT '',
    "suggestedAlt" TEXT DEFAULT '',
    "suggestedFilename" TEXT,
    "reasoning" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SeoImageAlt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeoImageAlt_storeId_imageId_key" ON "SeoImageAlt"("storeId", "imageId");
CREATE INDEX "SeoImageAlt_storeId_status_idx" ON "SeoImageAlt"("storeId", "status");
CREATE INDEX "SeoImageAlt_storeId_productId_idx" ON "SeoImageAlt"("storeId", "productId");
ALTER TABLE "SeoImageAlt" ADD CONSTRAINT "SeoImageAlt_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- M23 Schema Validator
CREATE TABLE "SeoSchemaValidation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "pageUrlHash" TEXT NOT NULL,
    "schemaType" TEXT NOT NULL DEFAULT 'Product',
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "eligibleRichResults" JSONB NOT NULL DEFAULT '[]',
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeoSchemaValidation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeoSchemaValidation_storeId_pageUrlHash_schemaType_key"
  ON "SeoSchemaValidation"("storeId", "pageUrlHash", "schemaType");
CREATE INDEX "SeoSchemaValidation_storeId_isValid_idx" ON "SeoSchemaValidation"("storeId", "isValid");
CREATE INDEX "SeoSchemaValidation_storeId_lastCheckedAt_idx" ON "SeoSchemaValidation"("storeId", "lastCheckedAt");
ALTER TABLE "SeoSchemaValidation" ADD CONSTRAINT "SeoSchemaValidation_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
