import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { TeamClient } from "./TeamClient";

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
        where: { job: { status: { in: ["active", "scheduled"] } } },
        include: { job: { select: { customerName: true, siteName: true } } },
        orderBy: { assignedDate: "desc" },
        take: 1,
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const serialised = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    currentJob: u.assignments[0]
      ? `${u.assignments[0].job.customerName} — ${u.assignments[0].job.siteName}`
      : null,
  }));

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {users.length} member{users.length !== 1 ? "s" : ""}
          </p>
        </div>
        <TeamClient users={serialised} canEdit={user.role === "director"} />
      </div>
    </AppShell>
  );
}
