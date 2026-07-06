import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { QuotesClient } from "./QuotesClient";

export default async function QuotesPage() {
  const user = await requireRole(["sales_engineer", "director", "admin"]).catch(() => null);
  if (!user) redirect("/");

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Quotes</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Historical job data for quoting
          </p>
        </div>
        <QuotesClient />
      </div>
    </AppShell>
  );
}
