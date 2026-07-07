import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { detectConflict } from "@/lib/schedule/conflictDetection";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await db.assignment.delete({ where: { id: params.id } });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}

const patchSchema = z
  .object({
    assignedDate: z.string().datetime().optional(),
    endDate: z.string().datetime().nullable().optional(),
  })
  .refine(
    (v) => {
      if (!v.assignedDate || !v.endDate) return true;
      return v.endDate >= v.assignedDate;
    },
    { message: "endDate must be on or after assignedDate", path: ["endDate"] }
  );

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const existing = await db.assignment.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: { assignedDate?: Date; endDate?: Date | null } = {};

  if (parsed.data.assignedDate !== undefined) {
    const newStart = new Date(parsed.data.assignedDate);
    newStart.setUTCHours(0, 0, 0, 0);
    data.assignedDate = newStart;

    // Shift endDate by the same delta to preserve multi-day duration
    if (existing.endDate) {
      const delta = newStart.getTime() - existing.assignedDate.getTime();
      data.endDate = new Date(existing.endDate.getTime() + delta);
    }
  }

  // Explicit endDate in body overrides the auto-shifted one
  if (parsed.data.endDate !== undefined) {
    if (parsed.data.endDate === null) {
      data.endDate = null;
    } else {
      const d = new Date(parsed.data.endDate);
      d.setUTCHours(0, 0, 0, 0);
      data.endDate = d;
    }
  }

  // Conflict detection for the new date range
  const effectiveStart = data.assignedDate ?? existing.assignedDate;
  const effectiveEnd =
    data.endDate !== undefined
      ? (data.endDate ?? effectiveStart)
      : (existing.endDate ?? effectiveStart);

  const existingAssignments = await db.assignment.findMany({
    where: {
      userId: existing.userId,
      id: { not: params.id }, // exclude self
      assignedDate: { lte: effectiveEnd },
      OR: [
        { endDate: null, assignedDate: { gte: effectiveStart } },
        { endDate: { gte: effectiveStart } },
      ],
    },
    select: { id: true, assignedDate: true, endDate: true },
  });

  const conflicts = existingAssignments.filter((a) =>
    detectConflict(
      { startDate: a.assignedDate, endDate: a.endDate ?? a.assignedDate },
      { startDate: effectiveStart, endDate: effectiveEnd }
    )
  );

  const updated = await db.assignment.update({
    where: { id: params.id },
    data,
    include: {
      user: { select: { id: true, name: true, role: true } },
      job: { select: { id: true, customerName: true, siteName: true, siteAddress: true, status: true } },
    },
  });

  const responseBody: Record<string, unknown> = {
    id: updated.id,
    assignedDate: updated.assignedDate.toISOString(),
    endDate: updated.endDate?.toISOString() ?? null,
    user: updated.user,
    job: updated.job,
  };
  if (conflicts.length > 0) {
    responseBody.warning = "Technician already assigned on overlapping dates";
    responseBody.conflicts = conflicts.map((c) => ({
      id: c.id,
      assignedDate: c.assignedDate.toISOString(),
      endDate: c.endDate?.toISOString() ?? null,
    }));
  }
  return NextResponse.json(responseBody);
}
