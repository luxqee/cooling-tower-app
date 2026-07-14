import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { getActiveJobsWithHours } from "@/lib/jobs/queries";

export async function GET() {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobs = await getActiveJobsWithHours();

  return NextResponse.json(
    jobs.map((job) => {
      const loggedMinutes = job.timeEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
      const loggedHours = loggedMinutes / 60;
      const isOverQuota = loggedHours > job.quotedHours * 1.1;
      return {
        id: job.id,
        customerName: job.customerName,
        siteName: job.siteName,
        quotedHours: job.quotedHours,
        loggedHours: Math.round(loggedHours * 10) / 10,
        isOverQuota,
      };
    })
  );
}
