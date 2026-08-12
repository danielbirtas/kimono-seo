-- AlterEnum: add SUPER_ADMIN to UserRole, remove ADMIN (replaced by SUPER_ADMIN)
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- CreateEnum: UserPlan
CREATE TYPE "UserPlan" AS ENUM ('TRIAL', 'STARTER', 'GROWTH', 'AGENCY', 'ADMIN');

-- AlterTable: add plan columns to User
ALTER TABLE "User" ADD COLUMN "plan" "UserPlan" NOT NULL DEFAULT 'TRIAL';
ALTER TABLE "User" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "planStartedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "planEndsAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "trialCreditUsed" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable: UsageLog
CREATE TABLE "UsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageLog_userId_createdAt_idx" ON "UsageLog"("userId", "createdAt");
CREATE INDEX "UsageLog_userId_feature_idx" ON "UsageLog"("userId", "feature");
CREATE INDEX "UsageLog_storeId_createdAt_idx" ON "UsageLog"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
