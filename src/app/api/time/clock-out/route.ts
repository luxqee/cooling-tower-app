import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { calcDurationMinutes } from "@/lib/time/utils";

const schema = z.object({
  entryId: z.string().uuid(),
});

export async function POST(req: Request) {
  const user = await requireRole(["technician", "service_manager", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const { entryId } = parsed.data;

  const entry = await db.timeEntry.findFirst({
    where: { id: entryId, userId: user.id, status: "active" },
  });
  if (!entry) {
    return NextResponse.json({ error: "No active time entry found" }, { status: 404 });
  }

  const clockOutTime = new Date();
  const durationMinutes = calcDurationMinutes(entry.clockInTime, clockOutTime);

  const updated = await db.timeEntry.update({
    where: { id: entry.id },
    data: { clockOutTime, durationMinutes, status: "complete" },
  });

  return NextResponse.json(updated);
}
