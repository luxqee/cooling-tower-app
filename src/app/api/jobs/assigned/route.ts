import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET() {
  const user = await requireRole(["technician", "service_manager", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const assignments = await db.assignment.findMany({
    where: {
      userId: user.id,
      assignedDate: { gte: today, lt: tomorrow },
    },
    include: {
      job: {
        select: {
          id: true,
          customerName: true,
          siteName: true,
          siteAddress: true,
          status: true,
          quotedHours: true,
        },
      },
    },
  });

  return NextResponse.json(assignments.map((a) => a.job));
}
