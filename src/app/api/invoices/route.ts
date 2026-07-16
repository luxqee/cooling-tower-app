import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { getAllInvoicesWithJob } from "@/lib/invoicing/queries";

export async function GET() {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoices = await getAllInvoicesWithJob({ take: 100 });

  return NextResponse.json(
    invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      baseAmount: inv.baseAmount.toNumber(),
      variationsTotal: inv.variationsTotal.toNumber(),
      totalAmount: inv.totalAmount.toNumber(),
      sentAt: inv.sentAt?.toISOString() ?? null,
      paidAt: inv.paidAt?.toISOString() ?? null,
      createdAt: inv.createdAt.toISOString(),
      job: inv.job,
    }))
  );
}
