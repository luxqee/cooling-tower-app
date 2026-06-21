import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";

export default async function JobsPage() {
  const user = await requireRole(["director", "service_manager", "admin", "sales_engineer"]).catch(() => null);
  if (!user) redirect("/sign-in");

  const jobs = await db.job.findMany({
    where: { status: { in: ["active", "scheduled"] } },
    select: {
      id: true,
      customerName: true,
      siteName: true,
      quotedHours: true,
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
    return { id: job.id, customerName: job.customerName, siteName: job.siteName, quotedHours: job.quotedHours, loggedHours, isOverQuota, crew, status: job.status };
  });

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Jobs</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Active and scheduled jobs with hours tracked vs quoted
          </p>
        </div>

        {rows.length === 0 && (
          <p className="text-sm text-slate-500">No active jobs.</p>
        )}

        <div className="space-y-3">
          {rows.map((job) => (
            <div
              key={job.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{job.customerName}</p>
                  <p className="text-sm text-slate-500 truncate">{job.siteName}</p>
                </div>
                <span
                  className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                    job.status === "active"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {job.status}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">Hours logged</span>
                    <span className={job.isOverQuota ? "text-red-600 font-semibold" : "text-slate-700 dark:text-slate-300"}>
                      {job.loggedHours}h / {job.quotedHours}h
                      {job.isOverQuota && " ⚠"}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        job.isOverQuota ? "bg-red-500" : "bg-amber-400"
                      }`}
                      style={{
                        width: `${Math.min((job.loggedHours / job.quotedHours) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {job.crew.length > 0 && (
                <p className="text-xs text-slate-500">
                  {job.crew.join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
