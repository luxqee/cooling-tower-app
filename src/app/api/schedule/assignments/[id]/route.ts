import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db.assignment.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
