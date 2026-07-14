import { db } from "@/lib/db/client";
import { getCustomerForToken } from "@/lib/portal/getCustomerForToken";
import { StatusBadge } from "@/components/ui/StatusBadge";

export default async function CustomerPortalPage({ params }: { params: { token: string } }) {
  const customer = await getCustomerForToken(params.token);

  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm text-center space-y-2">
          <h1 className="text-lg font-semibold text-slate-900">Link no longer valid</h1>
          <p className="text-sm text-slate-500">
            This link has expired or is incorrect. Please contact us for a new one.
          </p>
        </div>
      </div>
    );
  }

  const [jobs, invoices, complianceDocs] = await Promise.all([
    db.job.findMany({
      where: { customerId: customer.id },
      select: { id: true, siteName: true, jobType: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    db.invoice.findMany({
      where: { job: { customerId: customer.id } },
      select: { id: true, invoiceNumber: true, totalAmount: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    db.complianceDocument.findMany({
      where: { job: { customerId: customer.id } },
      select: { id: true, submittedAt: true, template: { select: { name: true } } },
      orderBy: { submittedAt: "desc" },
      take: 25,
    }),
  ]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <div>
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Customer portal</p>
          <h1 className="text-xl font-semibold text-slate-900">{customer.name}</h1>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-700">Job history</h2>
          {jobs.length === 0 && <p className="text-sm text-slate-500">No jobs on record yet.</p>}
          {jobs.length > 0 && (
            <div className="rounded-lg border border-slate-300 bg-white divide-y divide-slate-200">
              {jobs.map((j) => (
                <div key={j.id} className="px-4 py-3 text-sm flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{j.siteName}</p>
                    <p className="text-xs text-slate-500">{j.jobType} · {new Date(j.createdAt).toLocaleDateString("en-AU")}</p>
                  </div>
                  <StatusBadge status={j.status} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-700">Invoices</h2>
          {invoices.length === 0 && <p className="text-sm text-slate-500">No invoices on record yet.</p>}
          {invoices.length > 0 && (
            <div className="rounded-lg border border-slate-300 bg-white divide-y divide-slate-200">
              {invoices.map((inv) => (
                <div key={inv.id} className="px-4 py-3 text-sm flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{inv.invoiceNumber ?? "Draft"}</p>
                    <p className="text-xs text-slate-500">{new Date(inv.createdAt).toLocaleDateString("en-AU")}</p>
                  </div>
                  <p className="text-sm font-medium shrink-0">${inv.totalAmount.toNumber().toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-700">Compliance documents</h2>
          {complianceDocs.length === 0 && <p className="text-sm text-slate-500">No compliance documents on record yet.</p>}
          {complianceDocs.length > 0 && (
            <div className="rounded-lg border border-slate-300 bg-white divide-y divide-slate-200">
              {complianceDocs.map((doc) => (
                <div key={doc.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">{doc.template.name}</p>
                  <p className="text-xs text-slate-500">Submitted {new Date(doc.submittedAt).toLocaleDateString("en-AU")}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
