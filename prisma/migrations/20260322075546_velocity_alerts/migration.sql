/*
  Warnings:

  - The values [META_ADS_REVIEW] on the enum `ReportType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `metaAccessToken` on the `StoreSettings` table. All the data in the column will be lost.
  - You are about to drop the column `metaSentimentOn` on the `StoreSettings` table. All the data in the column will be lost.
  - You are about to drop the `MetaAdAccount` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MetaSentimentReport` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'WARNING', 'WATCH');

-- AlterEnum
BEGIN;
CREATE TYPE "ReportType_new" AS ENUM ('DASHBOARD_OVERVIEW', 'SALES_ANALYSIS', 'PRODUCT_PERFORMANCE', 'CUSTOMER_INSIGHTS', 'STOCK_HEALTH', 'GROWTH_RECOMMENDATIONS', 'CUSTOM');
ALTER TABLE "AiReport" ALTER COLUMN "type" TYPE "ReportType_new" USING ("type"::text::"ReportType_new");
ALTER TYPE "ReportType" RENAME TO "ReportType_old";
ALTER TYPE "ReportType_new" RENAME TO "ReportType";
DROP TYPE "public"."ReportType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "MetaAdAccount" DROP CONSTRAINT "MetaAdAccount_storeId_fkey";

-- DropForeignKey
ALTER TABLE "MetaSentimentReport" DROP CONSTRAINT "MetaSentimentReport_accountId_fkey";

-- AlterTable
ALTER TABLE "StockAlert" ADD COLUMN     "dailyVelocity" DOUBLE PRECISION,
ADD COLUMN     "daysOfStock" DOUBLE PRECISION,
ADD COLUMN     "leadTimeDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "severity" "AlertSeverity" NOT NULL DEFAULT 'WATCH',
ADD COLUMN     "velocityPeriodDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "StoreSettings" DROP COLUMN "metaAccessToken",
DROP COLUMN "metaSentimentOn",
ADD COLUMN     "stockLeadTimeDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "stockVelocityDays" INTEGER NOT NULL DEFAULT 30,
ALTER COLUMN "aiModel" SET DEFAULT 'gpt-4o';

-- DropTable
DROP TABLE "MetaAdAccount";

-- DropTable
DROP TABLE "MetaSentimentReport";

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "content" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiMessage_storeId_createdAt_idx" ON "AiMessage"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "StockAlert_storeId_severity_idx" ON "StockAlert"("storeId", "severity");

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
