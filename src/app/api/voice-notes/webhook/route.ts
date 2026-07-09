import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { fetchTranscript } from "@/lib/ai/assemblyai";
import { summarizeTranscript } from "@/lib/ai/voice-note";
import { calculateCostUsd } from "@/lib/ai/cost";

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

  try {
    const { summary, promptTokens, outputTokens } = await summarizeTranscript(result.text);
    const costUsd = calculateCostUsd("claude-haiku-4-5", promptTokens, outputTokens);

    await db.$transaction([
      db.voiceNote.update({
        where: { id: voiceNote.id },
        data: {
          transcript: result.text,
          summary: summary.summary,
          actionItems: summary.actionItems,
          status: "transcribed",
        },
      }),
      db.aiAuditLog.create({
        data: { userId: voiceNote.technicianId, feature: "voice_note", promptTokens, outputTokens, costUsd },
      }),
    ]);
  } catch (err) {
    console.error("Voice note summarization failed:", err);
    // Transcription itself succeeded even though summarization failed — keep the
    // raw transcript and mark transcribed rather than losing it entirely.
    await db.voiceNote.update({
      where: { id: voiceNote.id },
      data: { transcript: result.text, status: "transcribed" },
    });
  }

  return NextResponse.json({ ok: true });
}
