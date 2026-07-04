import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, getSessionUser } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const updateSchema = z.object({
  name:     z.string().min(1).optional(),
  type:     z.enum(["swms", "jsa", "whs"]).optional(),
  sections: z.array(z.any()).min(1, "At least one section is required").optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const template = await db.complianceTemplate.findUnique({ where: { id: params.id, isActive: true } });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  return NextResponse.json(template);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await db.complianceTemplate.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const updated = await db.complianceTemplate.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await db.complianceTemplate.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.complianceTemplate.update({ where: { id: params.id }, data: { isActive: false } });
  return NextResponse.json(updated);
}
