import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateCreateMaterialEntryInput } from "@/lib/materials/validate";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director", "service_manager", "technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await db.materialEntry.findMany({
    where: { jobId: params.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(
    entries.map((e) => ({
      ...e,
      estimatedCost: e.estimatedCost.toNumber(),
      actualCost: e.actualCost ? e.actualCost.toNumber() : null,
    }))
  );
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director", "service_manager", "technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateCreateMaterialEntryInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const jobId = params.id;
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const entry = await db.materialEntry.create({
    data: {
      jobId,
      createdById: user.id,
      description: parsed.data.description,
      supplierName: parsed.data.supplierName ?? null,
      quantity: parsed.data.quantity ?? null,
      estimatedCost: parsed.data.estimatedCost,
      status: "pending",
    },
  });

  return NextResponse.json(
    { ...entry, estimatedCost: entry.estimatedCost.toNumber(), actualCost: null },
    { status: 201 }
  );
}
