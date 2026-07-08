-- CreateEnum
CREATE TYPE "MaterialEntryStatus" AS ENUM ('pending', 'received', 'reconciled');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "materialsTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MaterialEntry" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "supplierName" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "estimatedCost" DECIMAL(12,2) NOT NULL,
    "actualCost" DECIMAL(12,2),
    "receiptUrl" TEXT,
    "status" "MaterialEntryStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciledAt" TIMESTAMP(3),

    CONSTRAINT "MaterialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialEntry_jobId_idx" ON "MaterialEntry"("jobId");

-- CreateIndex
CREATE INDEX "MaterialEntry_status_idx" ON "MaterialEntry"("status");

-- AddForeignKey
ALTER TABLE "MaterialEntry" ADD CONSTRAINT "MaterialEntry_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialEntry" ADD CONSTRAINT "MaterialEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
