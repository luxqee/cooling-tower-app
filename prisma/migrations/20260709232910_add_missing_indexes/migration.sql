-- DropIndex
DROP INDEX "DocumentChunk_sourceType_sourceId_idx";

-- DropIndex
DROP INDEX "Invoice_jobId_idx";

-- DropIndex
DROP INDEX "JobCommunication_jobId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_sourceType_sourceId_key" ON "DocumentChunk"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Job_customerId_idx" ON "Job"("customerId");

-- CreateIndex
CREATE INDEX "Job_contractId_idx" ON "Job"("contractId");

-- CreateIndex
CREATE INDEX "JobCommunication_authorId_idx" ON "JobCommunication"("authorId");

-- CreateIndex
CREATE INDEX "MaterialEntry_createdById_idx" ON "MaterialEntry"("createdById");

-- CreateIndex
CREATE INDEX "Variation_technicianId_idx" ON "Variation"("technicianId");

-- CreateIndex
CREATE INDEX "VoiceNote_technicianId_idx" ON "VoiceNote"("technicianId");

-- Vector ANN index for semantic search (pgvector) — cannot be expressed in
-- schema.prisma (no @@index syntax for the HNSW access method / opclass),
-- so this is hand-written raw SQL, same category as the vector column itself.
CREATE INDEX "DocumentChunk_embedding_hnsw_idx" ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops);
