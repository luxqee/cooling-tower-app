import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import Link from "next/link";

const TYPE_LABELS: Record<string, string> = { swms: "SWMS", jsa: "JSA", whs: "WHS" };
const TYPE_COLOURS: Record<string, string> = {
  swms: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  jsa:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  whs:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

export default async function CompliancePage() {
  const user = await requireRole(["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"]).catch(() => null);
  if (!user) redirect("/sign-in");

  const docs = await db.complianceDocument.findMany({
    include: {
      template:  { select: { name: true, type: true } },
      job:       { select: { customerName: true, siteName: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Compliance Documents</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">SWMS, JSA, and WHS records</p>
          </div>
          <div className="flex items-center gap-3">
            {user.role === "admin" && (
              <Link href="/compliance/templates" className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 underline underline-offset-2">
                Manage templates
              </Link>
            )}
            <Link href="/compliance/new" className="min-h-[40px] px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm flex items-center">
              New document
            </Link>
          </div>
        </div>

        {docs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">No compliance documents yet.</p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div key={doc.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLOURS[doc.template.type] ?? ""}`}>
                        {TYPE_LABELS[doc.template.type] ?? doc.template.type}
                      </span>
                      <p className="font-medium truncate">{doc.template.name}</p>
                    </div>
                    <p className="text-sm text-slate-500 truncate">{doc.job.customerName} — {doc.job.siteName}</p>
                    <p className="text-xs text-slate-400">
                      {doc.createdBy.name} · {new Date(doc.submittedAt).toLocaleDateString("en-AU")}
                    </p>
                  </div>
                  {doc.pdfUrl && (
                    <a
                      href={`/api/photos?url=${encodeURIComponent(doc.pdfUrl)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-sm text-amber-600 hover:text-amber-700 underline underline-offset-2"
                    >
                      View PDF
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
