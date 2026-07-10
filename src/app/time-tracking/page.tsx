import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { PAGE_ACCESS } from "@/lib/permissions";
import { db } from "@/lib/db/client";
import { ClockCard } from "./ClockCard";
import { redirect } from "next/navigation";

export default async function TimeTrackingPage() {
  const user = await requireRole(PAGE_ACCESS.timeTracking).catch(() => null);
  if (!user) redirect("/sign-in");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const [assignments, activeEntry] = await Promise.all([
    db.assignment.findMany({
      where: {
        userId: user.id,
        OR: [
          // Single-day assignment exactly today
          { assignedDate: { gte: today, lt: tomorrow }, endDate: null },
          // Multi-day assignment that spans today
          { assignedDate: { lte: today }, endDate: { gte: today } },
        ],
      },
      include: {
        job: {
          select: { id: true, customerName: true, siteName: true, siteAddress: true },
        },
      },
    }).catch(() => []),
    db.timeEntry.findFirst({
      where: { userId: user.id, status: "active" },
      include: { job: { select: { customerName: true, siteName: true } } },
    }).catch(() => null),
  ]);

  let jobs = assignments.map((a) => a.job);
  let usingFallback = false;

  // Fallback: if no assignments today and user is a technician, show jobs they've
  // been assigned to historically so they can clock in on unplanned visits.
  // Directors/service_managers have no assignment expectation — skip the fallback.
  if (jobs.length === 0 && user.role === "technician") {
    // Only show jobs the technician has been assigned to before (prevents misleading 403)
    const historicalAssignments = await db.assignment.findMany({
      where: { userId: user.id },
      select: { jobId: true },
    }).catch(() => []);
    const assignedJobIds = historicalAssignments.map((a) => a.jobId);
    const fallbackJobs = assignedJobIds.length > 0
      ? await db.job.findMany({
          where: { id: { in: assignedJobIds }, status: { in: ["active", "scheduled"] } },
          select: { id: true, customerName: true, siteName: true, siteAddress: true },
          orderBy: { customerName: "asc" },
        }).catch(() => [])
      : [];
    jobs = fallbackJobs;
    usingFallback = true;
  }

  const serialisedEntry = activeEntry
    ? {
        ...activeEntry,
        clockInTime: activeEntry.clockInTime.toISOString(),
        clockOutTime: activeEntry.clockOutTime?.toISOString() ?? null,
      }
    : null;

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Time Tracking</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {today.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        <ClockCard jobs={jobs} activeEntry={serialisedEntry} usingFallback={usingFallback} />
      </div>
    </AppShell>
  );
}
