-- CreateTable
CREATE TABLE "GscTriageResult" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "action" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "triagedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GscTriageResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GscTriageResult_storeId_action_idx" ON "GscTriageResult"("storeId", "action");

-- CreateIndex
CREATE INDEX "GscTriageResult_storeId_priority_idx" ON "GscTriageResult"("storeId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "GscTriageResult_storeId_keyword_key" ON "GscTriageResult"("storeId", "keyword");

-- AddForeignKey
ALTER TABLE "GscTriageResult" ADD CONSTRAINT "GscTriageResult_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
