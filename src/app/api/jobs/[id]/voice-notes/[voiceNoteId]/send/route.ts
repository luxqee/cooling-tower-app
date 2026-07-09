import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateSendVoiceNoteInput } from "@/lib/voice-notes/validate";
import { summarizeTranscript } from "@/lib/ai/voice-note";
import { calculateCostUsd } from "@/lib/ai/cost";

export async function POST(
  req: Request,
  { params }: { params: { id: string; voiceNoteId: string } }
) {
  const user = await requireRole(["technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateSendVoiceNoteInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { transcript } = parsed.data;

  const voiceNote = await db.voiceNote.findFirst({
    where: { id: params.voiceNoteId, jobId: params.id, technicianId: user.id, status: "awaiting_review" },
  });
  if (!voiceNote) {
    return NextResponse.json({ error: "Voice note not found or already sent" }, { status: 404 });
  }

  try {
    const { summary, promptTokens, outputTokens } = await summarizeTranscript(transcript);
    const costUsd = calculateCostUsd("claude-haiku-4-5", promptTokens, outputTokens);

    await db.$transaction([
      db.voiceNote.update({
        where: { id: voiceNote.id },
        data: {
          transcript,
          summary: summary.summary,
          actionItems: summary.actionItems,
          status: "transcribed",
        },
      }),
      db.aiAuditLog.create({
        data: { userId: user.id, feature: "voice_note", promptTokens, outputTokens, costUsd },
      }),
    ]);
  } catch (err) {
    console.error("Voice note summarization failed:", err);
    // Same graceful-degradation contract as before: never lose the
    // technician-confirmed transcript even if the summarization step fails.
    await db.voiceNote.update({
      where: { id: voiceNote.id },
      data: { transcript, status: "transcribed" },
    });
  }

  return NextResponse.json({ ok: true });
}
