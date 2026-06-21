import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";

const ROLE_LABELS: Record<string, string> = {
  technician: "Technician",
  director: "Director",
  service_manager: "Service Manager",
  admin: "Admin",
  sales_engineer: "Sales Engineer",
  draftsman: "Draftsman",
};

const ROLE_COLOURS: Record<string, string> = {
  technician: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  director: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  service_manager: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  admin: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  sales_engineer: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  draftsman: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

export default async function TeamPage() {
  const user = await requireRole(["director", "service_manager"]).catch(() => null);
  if (!user) redirect("/sign-in");

  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      assignments: {
        where: {
          job: { status: { in: ["active", "scheduled"] } },
        },
        include: { job: { select: { customerName: true, siteName: true } } },
        orderBy: { assignedDate: "desc" },
        take: 1,
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {users.length} member{users.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-4 bg-white dark:bg-slate-800 ${
                u.isActive
                  ? "border-slate-200 dark:border-slate-700"
                  : "border-slate-200 dark:border-slate-700 opacity-50"
              }`}
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{u.name}</p>
                  {!u.isActive && (
                    <span className="text-xs text-slate-400 font-mono">inactive</span>
                  )}
                </div>
                <p className="text-sm text-slate-500 truncate">{u.email}</p>
                {u.assignments[0] && (
                  <p className="text-xs text-slate-400 truncate">
                    {u.assignments[0].job.customerName} — {u.assignments[0].job.siteName}
                  </p>
                )}
              </div>
              <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLOURS[u.role] ?? ""}`}>
                {ROLE_LABELS[u.role] ?? u.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
