import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { indexDocument } from "../src/lib/ai/semanticSearch";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  const alreadyIndexed = await db.$queryRawUnsafe<{ sourceId: string }[]>(
    `SELECT "sourceId" FROM "DocumentChunk"`
  );
  const indexedIds = new Set(alreadyIndexed.map((r) => r.sourceId));

  const voiceNotes = await db.voiceNote.findMany({
    where: { status: "transcribed", transcript: { not: null } },
    select: { id: true, jobId: true, transcript: true },
  });

  let voiceNotesIndexed = 0;
  for (const note of voiceNotes) {
    if (indexedIds.has(note.id) || !note.transcript) continue;
    try {
      await indexDocument("VoiceNote", note.id, note.jobId, note.transcript);
      voiceNotesIndexed++;
    } catch (err) {
      console.error(`Failed to index voice note ${note.id}:`, err);
    }
  }

  const communications = await db.jobCommunication.findMany({
    select: { id: true, jobId: true, body: true },
  });

  let communicationsIndexed = 0;
  for (const comm of communications) {
    if (indexedIds.has(comm.id)) continue;
    try {
      await indexDocument("JobCommunication", comm.id, comm.jobId, comm.body);
      communicationsIndexed++;
    } catch (err) {
      console.error(`Failed to index communication ${comm.id}:`, err);
    }
  }

  console.log(`Backfill complete. Voice notes indexed: ${voiceNotesIndexed}/${voiceNotes.length}. Communications indexed: ${communicationsIndexed}/${communications.length}.`);
  await db.$disconnect();
}

main();
