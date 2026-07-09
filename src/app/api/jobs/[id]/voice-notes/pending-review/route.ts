import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notes = await db.voiceNote.findMany({
    where: { jobId: params.id, technicianId: user.id, status: "awaiting_review" },
    orderBy: { createdAt: "asc" },
    select: { id: true, transcript: true, createdAt: true },
  });

  return NextResponse.json(notes);
}
