import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await db.complianceDocument.findUnique({
    where: { id: params.id },
    include: {
      template:  true,
      job:       { select: { customerName: true, siteName: true } },
      createdBy: { select: { name: true } },
    },
  });

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(doc);
}
