import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const schema = z.object({
  jobId: z.string().uuid(),
});

export async function POST(req: Request) {
  const user = await requireRole(["technician", "service_manager", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const { jobId } = parsed.data;

  const activeEntry = await db.timeEntry.findFirst({
    where: { userId: user.id, status: "active" },
  });
  if (activeEntry) {
    return NextResponse.json(
      { error: "Already clocked in to another job. Clock out first." },
      { status: 409 }
    );
  }

  const assignment = await db.assignment.findFirst({
    where: { userId: user.id, jobId },
  });
  if (!assignment) {
    return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });
  }

  const entry = await db.timeEntry.create({
    data: {
      userId: user.id,
      jobId,
      clockInTime: new Date(),
      status: "active",
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
