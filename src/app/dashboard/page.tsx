import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { redirect } from "next/navigation";
import { CrewBoard } from "./CrewBoard";
import { HoursOverview } from "./HoursOverview";

export default async function DashboardPage() {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) redirect("/sign-in");

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
