import { AppShell } from "@/components/layout/AppShell";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { LayoutDashboard } from "lucide-react";

export default function DashboardPage() {
  return (
    <AppShell>
      <PlaceholderPage
        title="Dashboard"
        description="Live overview of jobs, crew, and pending approvals for directors and the service manager."
        icon={LayoutDashboard}
        phase="1a"
        features={[
          "Real-time view of all active jobs with hours logged vs quoted",
          "Visual flag when actual hours exceed quoted by 10%",
          "Pending variation approvals with photo previews",
          "Live crew status — who is clocked into which job right now",
          "Refreshes every 30 seconds without manual reload",
        ]}
      />
    </AppShell>
  );
}
