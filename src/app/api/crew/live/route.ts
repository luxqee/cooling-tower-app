import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET() {
  const user = await requireRole(["service_manager", "director", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const activeEntries = await db.timeEntry.findMany({
    where: { status: "active" },
    include: {
      user: { select: { id: true, name: true } },
      job: { select: { id: true, customerName: true, siteName: true } },
    },
    orderBy: { clockInTime: "asc" },
  });

  return NextResponse.json(
    activeEntries.map((e) => ({
      entryId: e.id,
      technicianId: e.user.id,
      technicianName: e.user.name,
      jobId: e.job.id,
      customerName: e.job.customerName,
      siteName: e.job.siteName,
      clockInTime: e.clockInTime.toISOString(),
    }))
  );
}
