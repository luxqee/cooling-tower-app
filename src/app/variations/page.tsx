import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { VariationsList } from "./VariationsList";
import { redirect } from "next/navigation";

export default async function VariationsPage() {
  const user = await requireRole(["director", "admin"]).catch(() => null);
  if (!user) redirect("/sign-in");

  const [pendingRows, decidedRows] = await Promise.all([
    db.variation.findMany({
      where: { status: "pending" },
      include: {
        technician: { select: { name: true } },
        job: { select: { customerName: true, siteName: true } },
      },
      orderBy: { submittedAt: "asc" },
    }),
    db.variation.findMany({
      where: { status: { in: ["approved", "rejected", "queried"] } },
      include: {
        technician: { select: { name: true } },
        job: { select: { customerName: true, siteName: true } },
      },
      orderBy: { decidedAt: "desc" },
      take: 50,
    }),
  ]);

  const toRow = (v: (typeof pendingRows)[0]) => ({
    id: v.id,
    description: v.description,
    costEstimate: v.costEstimate.toNumber(),
    photoUrl: v.photoUrl,
    submittedAt: v.submittedAt.toISOString(),
    technician: v.technician,
    job: v.job,
  });

  const toDecidedRow = (v: (typeof decidedRows)[0]) => ({
    id: v.id,
    description: v.description,
    costEstimate: v.costEstimate.toNumber(),
    status: v.status as "approved" | "rejected" | "queried",
    decisionReason: v.decisionReason,
    decidedAt: v.decidedAt?.toISOString() ?? null,
    submittedAt: v.submittedAt.toISOString(),
    technician: v.technician,
    job: v.job,
  });

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-8">
        <div>
          <h1 className="text-xl font-semibold">Variations</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Pending approvals
          </p>
        </div>

        <VariationsList
          initialVariations={pendingRows.map(toRow)}
          decidedVariations={decidedRows.map(toDecidedRow)}
        />
      </div>
    </AppShell>
  );
}
