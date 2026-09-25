-- DropIndex
DROP INDEX "MenuItem_name_trgm_idx";

-- AlterTable
ALTER TABLE "TokenUsage" ADD COLUMN     "callId" TEXT;

-- CreateIndex
CREATE INDEX "TokenUsage_callId_idx" ON "TokenUsage"("callId");
