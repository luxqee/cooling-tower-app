import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { PAGE_ACCESS } from "@/lib/permissions";
import { db } from "@/lib/db/client";
import { VariationForm } from "../VariationForm";
import { redirect } from "next/navigation";

export default async function SubmitVariationPage() {
  const user = await requireRole(PAGE_ACCESS.variationsSubmit).catch(() => null);
  if (!user) redirect("/sign-in");

  const jobs = await db.job.findMany({
    where: { status: { in: ["active", "scheduled"] } },
    select: { id: true, customerName: true, siteName: true },
    orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
  });

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Log a Variation</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Extra work found on site that wasn&apos;t in the original scope.
          </p>
        </div>
        <VariationForm jobs={jobs} />
      </div>
    </AppShell>
  );
}
