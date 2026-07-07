import { AppShell } from "@/components/layout/AppShell";
import { getSessionUser } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { weekStart, toDateString } from "@/lib/schedule/dateUtils";
import { TodayCard } from "./TodayCard";
import { ScheduleGrid } from "./ScheduleGrid";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  // Technician: read-only today-card
  if (user.role === "technician") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const assignments = await db.assignment.findMany({
      where: { userId: user.id, assignedDate: { gte: today, lt: tomorrow } },
      include: {
        job: {
          select: {
            id: true,
            customerName: true,
            siteName: true,
            siteAddress: true,
            status: true,
          },
        },
      },
      orderBy: { assignedDate: "asc" },
    });

    const todayLabel = `Today — ${today.toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })}`;

    const serialised = assignments.map((a) => ({
      id: a.id,
      assignedDate: a.assignedDate.toISOString(),
      endDate: a.endDate?.toISOString() ?? null,
      job: {
        id: a.job.id,
        customerName: a.job.customerName,
        siteName: a.job.siteName,
        siteAddress: a.job.siteAddress,
        status: a.job.status,
      },
    }));

    return (
      <AppShell>
        <div className="max-w-lg mx-auto px-4 py-6">
          <TodayCard assignments={serialised} todayLabel={todayLabel} />
        </div>
      </AppShell>
    );
  }

  if (!["service_manager", "director", "admin"].includes(user.role)) {
    redirect("/");
  }

  // Manager / admin / director: week grid
  const isValidWeek = searchParams.week && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week);
  const monday = isValidWeek
    ? weekStart(new Date(searchParams.week!))
    : weekStart(new Date());
  const weekEnd = new Date(monday);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [assignments, technicians, jobs] = await Promise.all([
    db.assignment.findMany({
      where: { assignedDate: { gte: monday, lt: weekEnd } },
      include: {
        user: { select: { id: true, name: true, role: true } },
        job: {
          select: {
            id: true,
            customerName: true,
            siteName: true,
            siteAddress: true,
            status: true,
          },
        },
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

  const serialisedAssignments = assignments.map((a) => ({
    id: a.id,
    assignedDate: a.assignedDate.toISOString(),
    endDate: a.endDate?.toISOString() ?? null,
    user: a.user,
    job: a.job,
  }));

  return (
    <AppShell>
      <div className="px-4 py-6">
        <ScheduleGrid
          assignments={serialisedAssignments}
          technicians={technicians}
          jobs={jobs}
          weekStartDate={toDateString(monday)}
        />
      </div>
    </AppShell>
  );
}
