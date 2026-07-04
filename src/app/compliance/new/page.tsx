import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { ComplianceForm } from "./ComplianceForm";

export default async function NewComplianceDocumentPage() {
  const user = await requireRole(["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"]).catch(() => null);
  if (!user) redirect("/sign-in");

  const [jobs, templates] = await Promise.all([
    db.job.findMany({
      where: { status: { in: ["active", "scheduled"] } },
      select: { id: true, customerName: true, siteName: true },
      orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
    }),
    db.complianceTemplate.findMany({
      where: { isActive: true },
      select: { id: true, name: true, type: true, sections: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">New Compliance Document</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Fill in the required fields and sign.
          </p>
        </div>
        <ComplianceForm jobs={jobs} templates={templates} />
      </div>
    </AppShell>
  );
}
