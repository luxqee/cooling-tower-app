import { AppShell } from "@/components/layout/AppShell";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { Clock } from "lucide-react";

export default function TimeTrackingPage() {
  return (
    <AppShell>
      <PlaceholderPage
        title="Time tracking"
        description="Clock-in records and live crew status across all active jobs."
        icon={Clock}
        phase="1b"
        features={[
          "Live view of all 7 technicians and their current status",
          "Clock-in time, elapsed time, and current job per technician",
          "Filter by status — all, clocked on, available",
          "Server-recorded timestamps for audit integrity",
          "Time entries linked automatically to the correct job",
        ]}
      />
    </AppShell>
  );
}
