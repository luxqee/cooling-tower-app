-- CreateEnum
CREATE TYPE "VoiceNoteStatus" AS ENUM ('pending', 'transcribed', 'failed');

-- CreateTable
CREATE TABLE "VoiceNote" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "transcript" TEXT,
    "summary" TEXT,
    "actionItems" JSONB,
    "status" "VoiceNoteStatus" NOT NULL DEFAULT 'pending',
    "assemblyaiId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoiceNote_assemblyaiId_key" ON "VoiceNote"("assemblyaiId");

-- CreateIndex
CREATE INDEX "VoiceNote_jobId_idx" ON "VoiceNote"("jobId");

-- CreateIndex
CREATE INDEX "VoiceNote_status_idx" ON "VoiceNote"("status");

-- AddForeignKey
ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
