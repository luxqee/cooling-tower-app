import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateVoiceNoteInput } from "@/lib/voice-notes/validate";
import { uploadAudioToAssemblyAI, submitTranscription } from "@/lib/ai/assemblyai";
import { isOwnedBlobUrl } from "@/lib/blob/ownership";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateVoiceNoteInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { audioUrl, durationSeconds, mediaType } = parsed.data;

  const job = await db.job.findFirst({ where: { id: params.id, status: { in: ["active", "scheduled"] } } });
  if (!job) return NextResponse.json({ error: "Job not found or not active" }, { status: 404 });

  const assignment = await db.assignment.findFirst({ where: { userId: user.id, jobId: params.id } });
  if (!assignment) return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });

  if (!isOwnedBlobUrl(audioUrl, user.id, "voice-notes")) {
    return NextResponse.json({ error: "Invalid audio URL" }, { status: 400 });
  }

  const voiceNote = await db.voiceNote.create({
    data: { jobId: params.id, technicianId: user.id, audioUrl, durationSeconds, mediaType, status: "pending" },
  });

  try {
    const blobRes = await fetch(audioUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!blobRes.ok) throw new Error(`Failed to read uploaded audio: ${blobRes.status}`);
    const audioBuffer = Buffer.from(await blobRes.arrayBuffer());

    const uploadUrl = await uploadAudioToAssemblyAI(audioBuffer);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cooling-tower-app-alpha.vercel.app";
    const { id: assemblyaiId } = await submitTranscription(
      uploadUrl,
      `${appUrl}/api/voice-notes/webhook`,
      process.env.ASSEMBLYAI_WEBHOOK_SECRET!
    );

    await db.voiceNote.update({ where: { id: voiceNote.id }, data: { assemblyaiId } });
  } catch (err) {
    console.error("AssemblyAI submission failed:", err);
    await db.voiceNote.update({ where: { id: voiceNote.id }, data: { status: "failed" } });
  }

  return NextResponse.json(voiceNote, { status: 201 });
}
