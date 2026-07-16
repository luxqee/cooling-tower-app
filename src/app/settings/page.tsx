import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { PAGE_ACCESS } from "@/lib/permissions";
import { db } from "@/lib/db/client";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const user = await requireRole(PAGE_ACCESS.settings).catch(() => null);
  if (!user) redirect("/");

  const profile = await db.businessProfile.findFirst();

  const initial = {
    name:                profile?.name                ?? "Your Business",
    abn:                 profile?.abn                 ?? "",
    phone:               profile?.phone               ?? "",
    email:               profile?.email                ?? "",
    address:             profile?.address             ?? "",
    hourlyRate:          profile?.hourlyRate          ?? null,
    paymentTerms:        profile?.paymentTerms        ?? "",
    industryDescription: profile?.industryDescription ?? "field service maintenance",
  };

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Business profile shown on compliance PDFs and invoices.</p>
        </div>

        <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-5">Business Profile</h2>
          <SettingsForm initial={initial} initialLogoUrl={profile?.logoUrl ?? null} />
        </div>

        <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Export data</h2>
          <p className="text-sm text-slate-500 mb-5">Download your data as CSV.</p>
          <div className="flex flex-wrap gap-3">
            <a href="/api/export/customers" className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline">
              Customers (.csv)
            </a>
            <a href="/api/export/jobs" className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline">
              Jobs (.csv)
            </a>
            <a href="/api/export/invoices" className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline">
              Invoices (.csv)
            </a>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
