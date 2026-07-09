import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateSendVoiceNoteInput } from "@/lib/voice-notes/validate";
import { summarizeTranscript } from "@/lib/ai/voice-note";
import { calculateCostUsd } from "@/lib/ai/cost";
import { isOwnedBlobUrl } from "@/lib/blob/ownership";
import { indexDocument } from "@/lib/ai/semanticSearch";

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
  const { transcript, photoUrls } = parsed.data;

  // Photos are uploaded via the existing /api/upload/photo route, which stores
  // them under "variations/<userId>/..." — same private-blob convention, just
  // a different folder than voice-note audio/video.
  const allPhotosOwned = photoUrls.every((url) => isOwnedBlobUrl(url, user.id, "variations"));
  if (!allPhotosOwned) {
    return NextResponse.json({ error: "Invalid photo URL" }, { status: 400 });
  }

  const voiceNote = await db.voiceNote.findFirst({
    where: { id: params.voiceNoteId, jobId: params.id, technicianId: user.id, status: "awaiting_review" },
  });
  if (!voiceNote) {
    return NextResponse.json({ error: "Voice note not found or already sent" }, { status: 404 });
  }

  const photoData = photoUrls.map((photoUrl) => ({ voiceNoteId: voiceNote.id, photoUrl }));

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

  // Photos aren't dependent on summarization succeeding — save them either way.
  await db.voiceNotePhoto.createMany({ data: photoData });

  try {
    await indexDocument("VoiceNote", voiceNote.id, params.id, transcript);
  } catch (err) {
    console.error("Failed to index voice note for semantic search:", err);
  }

  return NextResponse.json({ ok: true });
}
