import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { VariationsList } from "./VariationsList";
import { redirect } from "next/navigation";

export default async function VariationsPage() {
  const user = await requireRole(["director", "admin"]).catch(() => null);
  if (!user) redirect("/sign-in");

  const rows = await db.variation.findMany({
    where: { status: "pending" },
    include: {
      technician: { select: { name: true } },
      job: { select: { customerName: true, siteName: true } },
    },
    orderBy: { submittedAt: "asc" },
  });

  const variations = rows.map((v) => ({
    id: v.id,
    description: v.description,
    costEstimate: v.costEstimate,
    photoUrl: v.photoUrl,
    submittedAt: v.submittedAt.toISOString(),
    technician: v.technician,
    job: v.job,
  }));

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Variations</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Pending approvals
          </p>
        </div>
        <VariationsList initialVariations={variations} />
      </div>
    </AppShell>
  );
}
