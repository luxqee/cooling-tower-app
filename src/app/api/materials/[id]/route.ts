import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateReconcileMaterialEntryInput } from "@/lib/materials/validate";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateReconcileMaterialEntryInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const entry = await db.materialEntry.update({
    where: { id: params.id },
    data: {
      actualCost: parsed.data.actualCost,
      receiptUrl: parsed.data.receiptUrl ?? undefined,
      status: "reconciled",
      reconciledAt: new Date(),
    },
  });

  return NextResponse.json({
    ...entry,
    estimatedCost: entry.estimatedCost.toNumber(),
    actualCost: entry.actualCost ? entry.actualCost.toNumber() : null,
  });
}
