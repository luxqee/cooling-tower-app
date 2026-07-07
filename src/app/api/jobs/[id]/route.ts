import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const patchSchema = z.object({
  customerName: z.string().min(2).optional(),
  siteName: z.string().min(2).optional(),
  siteAddress: z.string().min(5).optional(),
  quotedHours: z.number().positive().optional(),
  quotedCost: z.number().nonnegative().nullable().optional(),
  status: z.enum(["scheduled", "active", "complete", "cancelled"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const job = await db.job.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(job);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["director", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await db.job.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "P2003") {
      return NextResponse.json(
        { error: "Cannot delete job with related records (time entries, variations, etc). Mark as cancelled instead." },
        { status: 409 }
      );
    }
    if (code === "P2025") {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    throw err;
  }
}
