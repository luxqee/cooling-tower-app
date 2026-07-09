import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { fetchTranscript } from "@/lib/ai/assemblyai";

export async function POST(req: Request) {
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.ASSEMBLYAI_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const transcriptId = body.transcript_id as string | undefined;
  if (!transcriptId) return NextResponse.json({ error: "Missing transcript_id" }, { status: 400 });

  const voiceNote = await db.voiceNote.findUnique({ where: { assemblyaiId: transcriptId } });
  if (!voiceNote) return NextResponse.json({ error: "Voice note not found" }, { status: 404 });

  const result = await fetchTranscript(transcriptId);

  if (result.status === "error" || !result.text) {
    await db.voiceNote.update({ where: { id: voiceNote.id }, data: { status: "failed" } });
    return NextResponse.json({ ok: true });
  }

  // Raw transcript is ready — hand off to the technician for review before
  // any AI summarization happens. Claude runs later, at Send time
  // (POST .../voice-notes/:voiceNoteId/send), on whatever text the
  // technician confirms — not necessarily this raw AssemblyAI output.
  await db.voiceNote.update({
    where: { id: voiceNote.id },
    data: { transcript: result.text, status: "awaiting_review" },
  });

  return NextResponse.json({ ok: true });
}
