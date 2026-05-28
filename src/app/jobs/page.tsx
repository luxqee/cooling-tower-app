import { AppShell } from "@/components/layout/AppShell";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { Briefcase } from "lucide-react";

export default function JobsPage() {
  return (
    <AppShell>
      <PlaceholderPage
        title="Jobs"
        description="Active jobs with cost and time tracking against quoted figures."
        icon={Briefcase}
        phase="1b"
        features={[
          "List of active jobs with customer, site, and assigned crew",
          "Hours logged today, total hours, and quoted hours per job",
          "Drill into a job to see hour breakdown by technician",
          "Quoted vs actual variance comparison once a job is complete",
          "Director can add notes explaining significant variance",
        ]}
      />
    </AppShell>
  );
}
