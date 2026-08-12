CREATE TABLE IF NOT EXISTS "RedirectSuggestion" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'gsc',
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "appliedAt" TIMESTAMP(3),
    "shopifyRedirectId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RedirectSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RedirectSuggestion_storeId_fromPath_key" ON "RedirectSuggestion"("storeId", "fromPath");
CREATE INDEX IF NOT EXISTS "RedirectSuggestion_storeId_status_idx" ON "RedirectSuggestion"("storeId", "status");
CREATE INDEX IF NOT EXISTS "RedirectSuggestion_storeId_confidence_idx" ON "RedirectSuggestion"("storeId", "confidence");

ALTER TABLE "RedirectSuggestion" DROP CONSTRAINT IF EXISTS "RedirectSuggestion_storeId_fkey";
ALTER TABLE "RedirectSuggestion" ADD CONSTRAINT "RedirectSuggestion_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
