ALTER TABLE "LlmsTxt" ADD COLUMN IF NOT EXISTS "sections" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "LlmsTxt" ADD COLUMN IF NOT EXISTS "score" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "LlmsTxtHistory" (
    "id" TEXT NOT NULL,
    "llmsTxtId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LlmsTxtHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LlmsTxtHistory_llmsTxtId_createdAt_idx" ON "LlmsTxtHistory"("llmsTxtId", "createdAt");

ALTER TABLE "LlmsTxtHistory" DROP CONSTRAINT IF EXISTS "LlmsTxtHistory_llmsTxtId_fkey";
ALTER TABLE "LlmsTxtHistory" ADD CONSTRAINT "LlmsTxtHistory_llmsTxtId_fkey"
  FOREIGN KEY ("llmsTxtId") REFERENCES "LlmsTxt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
