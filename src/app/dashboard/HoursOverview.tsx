import { db } from "@/lib/db/client";
import { isOverQuota } from "@/lib/time/utils";
import { cn } from "@/lib/utils/cn";

export async function HoursOverview() {
  const jobs = await db.job.findMany({
    where: { status: { in: ["active", "scheduled"] } },
    select: {
      id: true,
      customerName: true,
      siteName: true,
      quotedHours: true,
      timeEntries: {
        where: { status: "complete" },
        select: { durationMinutes: true },
      },
    },
    orderBy: { createdAt: "desc" },
  }).catch(() => []);

  const rows = jobs.map((job) => {
    const loggedMinutes = job.timeEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
    const loggedHours = Math.round((loggedMinutes / 60) * 10) / 10;
    const over = isOverQuota(loggedHours, job.quotedHours);
    return { ...job, loggedHours, over };
  });

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Hours vs Quoted</h2>
      {rows.length === 0 && (
        <p className="text-sm text-slate-500">No active jobs.</p>
      )}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">{row.customerName}</p>
              <p className="text-sm text-slate-500 truncate">{row.siteName}</p>
            </div>
            <div className="text-right shrink-0">
              <p
                className={cn(
                  "text-sm font-mono tabular-nums",
                  row.over
                    ? "text-red-500"
                    : "text-slate-700 dark:text-slate-300"
                )}
              >
                {row.loggedHours}h / {row.quotedHours}h
              </p>
              {row.over && (
                <p className="text-xs font-mono uppercase text-red-500 tracking-wider">
                  Over quota
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
