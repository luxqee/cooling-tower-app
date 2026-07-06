-- AlterTable: Invoice amounts Float -> Decimal(12,2)
ALTER TABLE "Invoice" ALTER COLUMN "baseAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "variationsTotal" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable: Job add updatedAt (backfill existing rows with createdAt, then add NOT NULL)
ALTER TABLE "Job" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Job" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "Job" ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable: User make phone nullable
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "phone" DROP DEFAULT;

-- AlterTable: Variation costEstimate Float -> Decimal(12,2)
ALTER TABLE "Variation" ALTER COLUMN "costEstimate" SET DATA TYPE DECIMAL(12,2);

-- CreateIndex
CREATE INDEX "Assignment_assignedDate_idx" ON "Assignment"("assignedDate");

-- CreateIndex
CREATE INDEX "ComplianceDocument_templateId_idx" ON "ComplianceDocument"("templateId");

-- CreateIndex: Invoice unique on jobId
CREATE UNIQUE INDEX "Invoice_jobId_key" ON "Invoice"("jobId");

-- CreateIndex
CREATE INDEX "Invoice_jobId_idx" ON "Invoice"("jobId");

-- CreateIndex
CREATE INDEX "TimeEntry_jobId_status_idx" ON "TimeEntry"("jobId", "status");

-- Prevent TOCTOU race: only one active clock-in per user at a time
-- (Prisma cannot express partial unique indexes in schema.prisma declaratively)
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_entry_per_user"
  ON "TimeEntry"("userId") WHERE status = 'active';
