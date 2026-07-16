import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, getSessionUser } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { RESERVED_FIELD_PREFIX } from "@/lib/compliance/statutorySections";
import type { TemplateSections } from "@/lib/compliance/types";

const templateSchema = z.object({
  name:     z.string().min(1, "Name is required"),
  type:     z.enum(["swms", "jsa", "whs_management_plan", "induction"]),
  sections: z.array(z.any()).min(1, "At least one section is required"),
});

// Field IDs starting with RESERVED_FIELD_PREFIX are reserved for the
// code-defined statutory content in statutorySections.ts — an admin-created
// custom field must never be able to shadow or corrupt legally-mandated
// content. This is the actual guarantee; TemplateBuilder.tsx's client-side
// check is only for immediate feedback.
function usesReservedFieldId(sections: unknown): boolean {
  if (!Array.isArray(sections)) return false;
  return (sections as TemplateSections).some((s) =>
    Array.isArray(s?.fields) && s.fields.some((f) => typeof f?.id === "string" && f.id.startsWith(RESERVED_FIELD_PREFIX))
  );
}

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
  if (usesReservedFieldId(parsed.data.sections)) {
    return NextResponse.json({ error: `Field IDs starting with "${RESERVED_FIELD_PREFIX}" are reserved` }, { status: 400 });
  }

  const template = await db.complianceTemplate.create({ data: parsed.data });
  return NextResponse.json(template, { status: 201 });
}
