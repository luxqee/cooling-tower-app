import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { PAGE_ACCESS } from "@/lib/permissions";
import { db } from "@/lib/db/client";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(PAGE_ACCESS.compliance).catch(() => null);
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

  if (user.role === "technician") {
    const assignment = await db.assignment.findFirst({ where: { userId: user.id, jobId: doc.jobId } });
    if (!assignment) return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });
  }

  return NextResponse.json(doc);
}
