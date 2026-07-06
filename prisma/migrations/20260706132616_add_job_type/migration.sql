ALTER TABLE "Job" ADD COLUMN "jobType" TEXT;
UPDATE "Job" SET "jobType" = 'Unclassified';
ALTER TABLE "Job" ALTER COLUMN "jobType" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "Job_jobType_idx" ON "Job"("jobType");
