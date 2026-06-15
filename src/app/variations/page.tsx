import { AppShell } from "@/components/layout/AppShell";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { FileEdit } from "lucide-react";

export default function VariationsPage() {
  return (
    <AppShell>
      <PlaceholderPage
        title="Variations"
        description="Review, approve, or reject variations submitted from the field."
        icon={FileEdit}
        phase="1c"
        features={[
          "Queue of pending variations with photo previews",
          "Approve, reject, or query in a single tap",
          "Rejection requires a reason — minimum 10 characters",
          "Approved variations auto-flow to the job invoice record",
          "Full history of all variations per job — including rejected",
        ]}
      />
    </AppShell>
  );
}
