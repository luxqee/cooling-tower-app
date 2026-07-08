-- Create InvoiceStatus enum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'paid');

-- Extend Invoice table
ALTER TABLE "Invoice" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "status" "InvoiceStatus" NOT NULL DEFAULT 'draft';
ALTER TABLE "Invoice" ADD COLUMN "notes" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "sentAt" TIMESTAMPTZ;
ALTER TABLE "Invoice" ADD COLUMN "sentToEmail" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "paidAt" TIMESTAMPTZ;
ALTER TABLE "Invoice" ADD COLUMN "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Unique constraint on invoiceNumber
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- Status index
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- Extend BusinessProfile table
ALTER TABLE "BusinessProfile" ADD COLUMN "hourlyRate" FLOAT;
ALTER TABLE "BusinessProfile" ADD COLUMN "paymentTerms" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
