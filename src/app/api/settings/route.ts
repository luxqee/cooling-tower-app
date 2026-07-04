import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getSessionUser, requireRole } from "@/lib/auth/clerk";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.businessProfile.findFirst();
  return NextResponse.json(profile ?? { name: "CT Field Ops", abn: "", phone: "", email: "", address: "", logoUrl: null });
}

const updateSchema = z.object({
  name:    z.string().min(1, "Name is required").max(100).optional(),
  abn:     z.string().max(20).optional(),
  phone:   z.string().max(30).optional(),
  email:   z.string().email("Invalid email").or(z.literal("")).optional(),
  address: z.string().max(200).optional(),
});

export async function PATCH(req: Request) {
  try {
    await requireRole(["director", "admin"]);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation error" }, { status: 422 });
  }

  const existing = await db.businessProfile.findFirst();
  const profile = existing
    ? await db.businessProfile.update({ where: { id: existing.id }, data: parsed.data })
    : await db.businessProfile.create({ data: { name: "CT Field Ops", abn: "", phone: "", email: "", address: "", ...parsed.data } });

  return NextResponse.json(profile);
}
