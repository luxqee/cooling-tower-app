import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; voiceNoteId: string } }
) {
  const user = await requireRole(["director", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const note = await db.voiceNote.findFirst({
    where: { id: params.voiceNoteId, jobId: params.id },
    include: { photos: true },
  });
  if (!note) return NextResponse.json({ error: "Voice note not found" }, { status: 404 });

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
