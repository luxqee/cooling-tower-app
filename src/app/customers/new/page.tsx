import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { redirect } from "next/navigation";
import { CustomerForm } from "../CustomerForm";

export default async function NewCustomerPage() {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) redirect("/");

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">New customer</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Add a reusable customer record
          </p>
        </div>
        <CustomerForm />
      </div>
    </AppShell>
  );
}
