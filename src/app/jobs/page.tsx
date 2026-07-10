import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { PAGE_ACCESS } from "@/lib/permissions";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { JobsClient } from "./JobsClient";

export default async function JobsPage() {
  const user = await requireRole(PAGE_ACCESS.jobs).catch(() => null);
  if (!user) redirect("/sign-in");

  const canCreate = ["director", "service_manager", "admin"].includes(user.role);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const jobs = await db.job.findMany({
    where: {
      OR: [
        { status: { in: ["active", "scheduled"] } },
        { status: "complete", updatedAt: { gte: thirtyDaysAgo } },
      ],
    },
    select: {
      id: true,
      customerName: true,
      siteName: true,
      siteAddress: true,
      quotedHours: true,
      quotedCost: true,
      status: true,
      timeEntries: {
        where: { status: "complete" },
        select: { durationMinutes: true },
      },
      assignments: {
        include: { user: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = jobs.map((job) => {
    const loggedMinutes = job.timeEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
    const loggedHours = Math.round((loggedMinutes / 60) * 10) / 10;
    const isOverQuota = loggedHours > job.quotedHours * 1.1;
    const crew = [...new Set(job.assignments.map((a) => a.user.name))];
    return { id: job.id, customerName: job.customerName, siteName: job.siteName, siteAddress: job.siteAddress, quotedHours: job.quotedHours, quotedCost: job.quotedCost ? Number(job.quotedCost) : null, loggedHours, isOverQuota, crew, status: job.status };
  });

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Jobs</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Active, scheduled, and recently completed jobs
            </p>
          </div>
        </div>
        <JobsClient jobs={rows} canCreate={canCreate} />
      </div>
    </AppShell>
  );
}
