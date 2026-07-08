import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect, notFound } from "next/navigation";
import { InvoiceDetail } from "./InvoiceDetail";

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) redirect("/");

  const invoice = await db.invoice.findUnique({
    where: { id: params.id },
    include: {
      job: {
        select: {
          id: true, customerName: true, siteName: true, siteAddress: true, jobType: true,
          timeEntries: { where: { status: "complete" }, select: { durationMinutes: true } },
          variations: {
            where: { status: "approved" },
            select: { id: true, description: true, costEstimate: true, decidedAt: true },
          },
        },
      },
    },
  });

  if (!invoice) notFound();

  const businessProfile = await db.businessProfile.findFirst();

  const actualMinutes = invoice.job.timeEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const actualHours = Math.round((actualMinutes / 60) * 10) / 10;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <InvoiceDetail
          invoice={{
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            status: invoice.status as "draft" | "sent" | "paid",
            baseAmount: Number(invoice.baseAmount),
            variationsTotal: Number(invoice.variationsTotal),
            totalAmount: Number(invoice.totalAmount),
            notes: invoice.notes,
            sentAt: invoice.sentAt?.toISOString() ?? null,
            sentToEmail: invoice.sentToEmail,
            paidAt: invoice.paidAt?.toISOString() ?? null,
            createdAt: invoice.createdAt.toISOString(),
          }}
          job={{
            customerName: invoice.job.customerName,
            siteName: invoice.job.siteName,
            siteAddress: invoice.job.siteAddress,
            jobType: invoice.job.jobType,
            actualHours,
          }}
          variations={invoice.job.variations.map((v) => ({
            id: v.id,
            description: v.description,
            costEstimate: Number(v.costEstimate),
          }))}
          defaultHourlyRate={businessProfile?.hourlyRate ?? null}
          userRole={user.role as "admin" | "director"}
        />
      </div>
    </AppShell>
  );
}
