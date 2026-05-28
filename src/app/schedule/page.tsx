import { AppShell } from "@/components/layout/AppShell";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { Calendar } from "lucide-react";

export default function SchedulePage() {
  return (
    <AppShell>
      <PlaceholderPage
        title="Schedule"
        description="Crew assignments, breakdown response, and material delivery status."
        icon={Calendar}
        phase="1b"
        features={[
          "All jobs and assigned crew in one view",
          "Mark a job as breakdown or urgent in a single action",
          "Reassign a technician — affected scheduled clients flagged",
          "Push schedule to technicians' phones by 6 PM the night before",
          "Notify affected clients of reschedule by email or SMS in one click",
        ]}
      />
    </AppShell>
  );
}
