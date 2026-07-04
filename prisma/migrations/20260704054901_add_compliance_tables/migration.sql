-- CreateTable
CREATE TABLE "ComplianceTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "pdfUrl" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceTemplate_isActive_idx" ON "ComplianceTemplate"("isActive");

-- CreateIndex
CREATE INDEX "ComplianceDocument_jobId_idx" ON "ComplianceDocument"("jobId");

-- CreateIndex
CREATE INDEX "ComplianceDocument_createdById_idx" ON "ComplianceDocument"("createdById");

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ComplianceTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
