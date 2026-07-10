import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getSessionUser } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; voiceNoteId: string } }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const note = await db.voiceNote.findFirst({
    where: { id: params.voiceNoteId, jobId: params.id },
    include: { photos: true },
  });
  if (!note) return NextResponse.json({ error: "Voice note not found" }, { status: 404 });

  // Directors/admins can delete any voice note. A technician can only
  // discard their own recording, and only before it's been sent to the
  // office (awaiting_review) — once sent, deletion is an office-only action.
  const isOfficeDelete = user.role === "director" || user.role === "admin";
  const isOwnPendingNote =
    user.role === "technician" && note.technicianId === user.id && note.status === "awaiting_review";
  if (!isOfficeDelete && !isOwnPendingNote) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.$transaction([
    db.voiceNotePhoto.deleteMany({ where: { voiceNoteId: note.id } }),
    db.voiceNote.delete({ where: { id: note.id } }),
  ]);

  try {
    await del(note.audioUrl);
  } catch {
    /* already gone */
  }
  for (const photo of note.photos) {
    try {
      await del(photo.photoUrl);
    } catch {
      /* already gone */
    }
  }

  return NextResponse.json({ ok: true });
}
