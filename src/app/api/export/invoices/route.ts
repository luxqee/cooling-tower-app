import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { toCsv, csvResponse } from "@/lib/export/csv";

export async function GET() {
  const user = await requireRole(["director", "admin"]).catch(() => null);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const invoices = await db.invoice.findMany({
    include: { job: { select: { customerName: true, siteName: true } } },
    orderBy: { createdAt: "desc" },
  });

  const csv = toCsv(
    ["Invoice Number", "Customer", "Site Name", "Status", "Base Amount", "Variations Total", "Materials Total", "Total Amount", "Sent At", "Paid At", "Created"],
    invoices.map((i) => [
      i.invoiceNumber, i.job.customerName, i.job.siteName, i.status,
      i.baseAmount.toString(), i.variationsTotal.toString(), i.materialsTotal.toString(), i.totalAmount.toString(),
      i.sentAt, i.paidAt, i.createdAt,
    ]),
  );

  return csvResponse("invoices.csv", csv);
}
