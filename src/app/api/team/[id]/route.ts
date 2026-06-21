import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const patchSchema = z.object({
  role: z.enum(["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"]).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.id === params.id) {
    return NextResponse.json({ error: "Cannot edit your own account here." }, { status: 400 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const updated = await db.user.update({
    where: { id: params.id },
    data: parsed.data,
    select: { id: true, name: true, role: true, isActive: true },
  });

  return NextResponse.json(updated);
}
