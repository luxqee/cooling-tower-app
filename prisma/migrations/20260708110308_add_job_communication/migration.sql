-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM ('client_call', 'internal_note', 'field_instruction');

-- CreateTable
CREATE TABLE "JobCommunication" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" "CommunicationType" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobCommunication_jobId_idx" ON "JobCommunication"("jobId");

-- CreateIndex
CREATE INDEX "JobCommunication_jobId_type_idx" ON "JobCommunication"("jobId", "type");

-- AddForeignKey
ALTER TABLE "JobCommunication" ADD CONSTRAINT "JobCommunication_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCommunication" ADD CONSTRAINT "JobCommunication_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
