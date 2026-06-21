import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { ScheduleClient } from "./ScheduleClient";
import { redirect } from "next/navigation";

export default async function SchedulePage() {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) redirect("/sign-in");

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 14);

  const [assignments, technicians, jobs] = await Promise.all([
    db.assignment.findMany({
      where: { assignedDate: { gte: start, lt: end } },
      include: {
        user: { select: { id: true, name: true, role: true } },
        job: { select: { id: true, customerName: true, siteName: true, status: true } },
      },
      orderBy: [{ assignedDate: "asc" }, { user: { name: "asc" } }],
    }),
    db.user.findMany({
      where: { role: "technician", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.job.findMany({
      where: { status: { in: ["active", "scheduled"] } },
      select: { id: true, customerName: true, siteName: true },
      orderBy: { customerName: "asc" },
    }),
  ]);

  const serialised = assignments.map((a) => ({
    id: a.id,
    assignedDate: a.assignedDate.toISOString(),
    user: a.user,
    job: a.job,
  }));

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Schedule</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Next 14 days
            </p>
          </div>
        </div>
        <ScheduleClient assignments={serialised} technicians={technicians} jobs={jobs} />
      </div>
    </AppShell>
  );
}
