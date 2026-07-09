import crypto from "node:crypto";
import { db } from "@/lib/db/client";
import { embedText } from "./voyage";

export type DocumentSourceType = "VoiceNote" | "JobCommunication";

export async function indexDocument(
  sourceType: DocumentSourceType,
  sourceId: string,
  jobId: string,
  text: string
): Promise<void> {
  const embedding = await embedText(text);
  const vectorLiteral = `[${embedding.join(",")}]`;
  const id = crypto.randomUUID();
  await db.$executeRawUnsafe(
    `INSERT INTO "DocumentChunk" (id, "sourceType", "sourceId", "jobId", "chunkText", embedding, "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6::vector, now())`,
    id,
    sourceType,
    sourceId,
    jobId,
    text,
    vectorLiteral
  );
}

export interface SemanticSearchResult {
  id: string;
  sourceType: string;
  sourceId: string;
  jobId: string;
  chunkText: string;
  distance: number;
}

export async function semanticSearch(
  query: string,
  jobId?: string,
  limit = 5
): Promise<SemanticSearchResult[]> {
  const embedding = await embedText(query);
  const vectorLiteral = `[${embedding.join(",")}]`;

  if (jobId) {
    return db.$queryRawUnsafe<SemanticSearchResult[]>(
      `SELECT id, "sourceType", "sourceId", "jobId", "chunkText", embedding <=> $1::vector AS distance
       FROM "DocumentChunk" WHERE "jobId" = $2 ORDER BY embedding <=> $1::vector LIMIT $3`,
      vectorLiteral,
      jobId,
      limit
    );
  }

  return db.$queryRawUnsafe<SemanticSearchResult[]>(
    `SELECT id, "sourceType", "sourceId", "jobId", "chunkText", embedding <=> $1::vector AS distance
     FROM "DocumentChunk" ORDER BY embedding <=> $1::vector LIMIT $2`,
    vectorLiteral,
    limit
  );
}
