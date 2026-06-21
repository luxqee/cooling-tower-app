import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET() {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 14);

  const assignments = await db.assignment.findMany({
    where: { assignedDate: { gte: start, lt: end } },
    include: {
      user: { select: { id: true, name: true, role: true } },
      job: { select: { id: true, customerName: true, siteName: true, status: true } },
    },
    orderBy: [{ assignedDate: "asc" }, { user: { name: "asc" } }],
  });

  return NextResponse.json(
    assignments.map((a) => ({
      id: a.id,
      assignedDate: a.assignedDate.toISOString(),
      user: a.user,
      job: a.job,
    }))
  );
}

const createSchema = z.object({
  userId: z.string().uuid(),
  jobId: z.string().uuid(),
  assignedDate: z.string().datetime(),
});

export async function POST(req: Request) {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { userId, jobId, assignedDate } = parsed.data;

  const date = new Date(assignedDate);
  date.setHours(0, 0, 0, 0);

  try {
    const assignment = await db.assignment.create({
      data: { userId, jobId, assignedDate: date },
      include: {
        user: { select: { id: true, name: true, role: true } },
        job: { select: { id: true, customerName: true, siteName: true, status: true } },
      },
    });
    return NextResponse.json({
      id: assignment.id,
      assignedDate: assignment.assignedDate.toISOString(),
      user: assignment.user,
      job: assignment.job,
    }, { status: 201 });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Technician already assigned to this job on that date." }, { status: 409 });
    }
    throw err;
  }
}
