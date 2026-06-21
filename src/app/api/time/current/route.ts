import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET() {
  const user = await requireRole(["technician", "service_manager", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entry = await db.timeEntry.findFirst({
    where: { userId: user.id, status: "active" },
    include: { job: { select: { customerName: true, siteName: true } } },
  });

  return NextResponse.json(entry ?? null);
}
