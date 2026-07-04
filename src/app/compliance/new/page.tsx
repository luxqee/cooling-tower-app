import { AppShell } from "@/components/layout/AppShell";
import { getSessionUser } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { ComplianceForm } from "./ComplianceForm";

export default async function NewComplianceDocumentPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const [jobs, templates] = await Promise.all([
    db.job.findMany({
      where: { status: { in: ["scheduled", "active"] } },
      select: { id: true, customerName: true, siteName: true },
      orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
    }),
    db.complianceTemplate.findMany({
      where: { isActive: true },
      select: { id: true, name: true, type: true, sections: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (templates.length === 0) {
    return (
      <AppShell>
        <div className="max-w-lg mx-auto px-4 py-8">
          <h1 className="text-xl font-semibold mb-4">New Compliance Document</h1>
          <p className="text-slate-500">No templates available. Ask an admin to create one.</p>
        </div>
      </AppShell>
    );
  }

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
