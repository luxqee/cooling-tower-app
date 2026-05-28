import { AppShell } from "@/components/layout/AppShell";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { Users } from "lucide-react";

export default function TeamPage() {
  return (
    <AppShell>
      <PlaceholderPage
        title="Team"
        description="Manage technicians, roles, and active assignments across the business."
        icon={Users}
        phase="1a"
        features={[
          "User list across all six roles — technician, director, service manager, admin, sales engineer, draftsman",
          "Role-based access control — what each user can see and do",
          "Activate and deactivate accounts when staff change",
          "Current assignments per technician",
          "Login activity and last-active status",
        ]}
      />
    </AppShell>
  );
}
