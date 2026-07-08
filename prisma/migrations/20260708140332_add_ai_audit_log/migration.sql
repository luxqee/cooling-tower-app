-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('validation', 'voice_note', 'company_assistant');

-- CreateTable
CREATE TABLE "AiAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "toolCalls" JSONB,
    "promptTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiAuditLog_userId_idx" ON "AiAuditLog"("userId");

-- CreateIndex
CREATE INDEX "AiAuditLog_feature_idx" ON "AiAuditLog"("feature");

-- CreateIndex
CREATE INDEX "AiAuditLog_createdAt_idx" ON "AiAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AiAuditLog" ADD CONSTRAINT "AiAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
