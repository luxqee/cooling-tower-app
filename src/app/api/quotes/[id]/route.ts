import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const patchSchema = z.object({
  status: z.enum(["draft", "sent", "accepted", "declined"]),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director", "sales_engineer"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const quote = await db.quote.findUnique({ where: { id: params.id } });
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  return NextResponse.json({ ...quote, totalAmount: quote.totalAmount.toNumber() });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director", "sales_engineer"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const quote = await db.quote.update({ where: { id: params.id }, data: { status: parsed.data.status } });
  return NextResponse.json({ ...quote, totalAmount: quote.totalAmount.toNumber() });
}
