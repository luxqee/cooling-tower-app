import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, getSessionUser } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const templateSchema = z.object({
  name:     z.string().min(1, "Name is required"),
  type:     z.enum(["swms", "jsa", "whs"]),
  sections: z.array(z.any()).min(1, "At least one section is required"),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await db.complianceTemplate.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(templates);
}

export async function POST(req: Request) {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = templateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const template = await db.complianceTemplate.create({ data: parsed.data });
  return NextResponse.json(template, { status: 201 });
}
