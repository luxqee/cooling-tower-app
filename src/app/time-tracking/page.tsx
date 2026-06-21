import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { ClockCard } from "./ClockCard";
import { redirect } from "next/navigation";

export default async function TimeTrackingPage() {
  const user = await requireRole(["technician", "service_manager", "director"]).catch(() => null);
  if (!user) redirect("/sign-in");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const [assignments, activeEntry] = await Promise.all([
    db.assignment.findMany({
      where: { userId: user.id, assignedDate: { gte: today, lt: tomorrow } },
      include: {
        job: {
          select: { id: true, customerName: true, siteName: true, siteAddress: true },
        },
      },
    }),
    db.timeEntry.findFirst({
      where: { userId: user.id, status: "active" },
      include: { job: { select: { customerName: true, siteName: true } } },
    }),
  ]);

  const jobs = assignments.map((a) => a.job);
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

        <ClockCard jobs={jobs} activeEntry={serialisedEntry} />
      </div>
    </AppShell>
  );
}
