import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { weekStart } from "@/lib/schedule/dateUtils";
import { detectConflict } from "@/lib/schedule/conflictDetection";
import { sendPushToUser } from "@/lib/push/vapid";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekParam = searchParams.get("week");
  const isValidWeek = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam);
  const monday = isValidWeek ? weekStart(new Date(weekParam!)) : weekStart(new Date());
  const weekEnd = new Date(monday);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const assignments = await db.assignment.findMany({
    where: {
      assignedDate: { gte: monday, lt: weekEnd },
      ...(user.role === "technician" ? { userId: user.id } : {}),
    },
    include: {
      user: { select: { id: true, name: true, role: true } },
      job: { select: { id: true, customerName: true, siteName: true, siteAddress: true, status: true } },
    },
    orderBy: [{ assignedDate: "asc" }, { user: { name: "asc" } }],
  });

  return NextResponse.json(
    assignments.map((a) => ({
      id: a.id,
      assignedDate: a.assignedDate.toISOString(),
      endDate: a.endDate?.toISOString() ?? null,
      user: a.user,
      job: a.job,
    }))
  );
}

const createSchema = z
  .object({
    userId: z.string().uuid(),
    jobId: z.string().uuid(),
    assignedDate: z.string().datetime(),
    endDate: z.string().datetime().optional(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.assignedDate, {
    message: "endDate must be on or after assignedDate",
    path: ["endDate"],
  });

export async function POST(req: Request) {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { userId, jobId, assignedDate, endDate } = parsed.data;

  const startDate = new Date(assignedDate);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDateObj = endDate ? new Date(endDate) : new Date(startDate);
  if (endDate) endDateObj.setUTCHours(0, 0, 0, 0);

  // Conflict detection: existing assignments for this technician
  const existingAssignments = await db.assignment.findMany({
    where: {
      userId,
      assignedDate: { lte: endDateObj },
      OR: [
        { endDate: null, assignedDate: { gte: startDate } },
        { endDate: { gte: startDate } },
      ],
    },
    select: { id: true, assignedDate: true, endDate: true },
  });

  const conflicts = existingAssignments.filter((a) =>
    detectConflict(
      { startDate: a.assignedDate, endDate: a.endDate ?? a.assignedDate },
      { startDate, endDate: endDateObj }
    )
  );

  try {
    const assignment = await db.assignment.create({
      data: { userId, jobId, assignedDate: startDate, endDate: endDate ? endDateObj : null },
      include: {
        user: { select: { id: true, name: true, role: true } },
        job: { select: { id: true, customerName: true, siteName: true, siteAddress: true, status: true } },
      },
    });

    // Push notification to technician (fire-and-forget)
    const techWithSubs = await db.user.findUnique({
      where: { id: userId },
      include: { pushSubscriptions: true },
    });
    if (techWithSubs?.pushSubscriptions?.length) {
      const dateLabel = startDate.toLocaleDateString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      void Promise.allSettled(
        techWithSubs.pushSubscriptions.map((sub) =>
          sendPushToUser(sub, {
            title: "New job assignment",
            body: `${assignment.job.customerName} — ${assignment.job.siteName}, ${dateLabel}`,
            url: "/schedule",
          })
        )
      );
    }

    const responseBody: Record<string, unknown> = {
      id: assignment.id,
      assignedDate: assignment.assignedDate.toISOString(),
      endDate: assignment.endDate?.toISOString() ?? null,
      user: assignment.user,
      job: assignment.job,
    };

    if (conflicts.length > 0) {
      responseBody.warning = "Technician already assigned on overlapping dates";
      responseBody.conflicts = conflicts.map((c) => ({
        id: c.id,
        assignedDate: c.assignedDate.toISOString(),
        endDate: c.endDate?.toISOString() ?? null,
      }));
    }

    return NextResponse.json(responseBody, { status: 201 });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Technician already assigned to this job on that date." },
        { status: 409 }
      );
    }
    throw err;
  }
}
