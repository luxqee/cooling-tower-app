import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { PAGE_ACCESS } from "@/lib/permissions";
import { getAllInvoicesWithJob } from "@/lib/invoicing/queries";
import { redirect } from "next/navigation";
import { InvoiceList } from "./InvoiceList";

export default async function InvoicesPage() {
  const user = await requireRole(PAGE_ACCESS.invoices).catch(() => null);
  if (!user) redirect("/");

  const invoices = await getAllInvoicesWithJob({ take: 200 });

  const rows = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status as "draft" | "sent" | "paid",
    baseAmount: Number(inv.baseAmount),
    variationsTotal: Number(inv.variationsTotal),
    totalAmount: Number(inv.totalAmount),
    sentAt: inv.sentAt?.toISOString() ?? null,
    paidAt: inv.paidAt?.toISOString() ?? null,
    createdAt: inv.createdAt.toISOString(),
    job: inv.job,
  }));

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Invoices</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage and send invoices to customers
          </p>
        </div>
        <InvoiceList invoices={rows} />
      </div>
    </AppShell>
  );
}
