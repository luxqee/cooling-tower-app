import { AppShell } from "@/components/layout/AppShell";
import { getSessionUser } from "@/lib/auth/clerk";
import { redirect } from "next/navigation";
import { CrewBoard } from "./CrewBoard";
import { HoursOverview } from "./HoursOverview";

const DASHBOARD_ROLES = ["director", "service_manager", "admin"] as const;
type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export default async function DashboardPage() {
  const user = await getSessionUser().catch(() => null);
  if (!user) redirect("/sign-in");
  // Route non-admin roles to their home page rather than /sign-in: Clerk
  // would immediately redirect back to /dashboard creating an infinite loop.
  if (!DASHBOARD_ROLES.includes(user.role as DashboardRole)) redirect("/time-tracking");

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        <h1 className="text-xl font-semibold">Dashboard</h1>

        {(user.role === "service_manager" || user.role === "director") && (
          <CrewBoard />
        )}

        {(user.role === "director" || user.role === "admin") && (
          <HoursOverview />
        )}
      </div>
    </AppShell>
  );
}
