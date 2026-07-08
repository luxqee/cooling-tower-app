import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { generateInvoicePdf } from "@/lib/invoicing/generateInvoicePdf";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoice = await db.invoice.findUnique({ where: { id: params.id } });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [job, businessProfile] = await Promise.all([
    db.job.findUnique({
      where: { id: invoice.jobId },
      select: {
        customerName: true, siteName: true, siteAddress: true, jobType: true,
        variations: { where: { status: "approved" }, select: { description: true, costEstimate: true } },
      },
    }),
    db.businessProfile.findFirst(),
  ]);

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const invoiceNumber = invoice.invoiceNumber ?? "DRAFT";

  const pdfBuffer = await generateInvoicePdf({
    invoice: {
      invoiceNumber,
      baseAmount: invoice.baseAmount.toNumber(),
      variationsTotal: invoice.variationsTotal.toNumber(),
      totalAmount: invoice.totalAmount.toNumber(),
      notes: invoice.notes,
      createdAt: invoice.createdAt.toISOString(),
    },
    variations: job.variations.map((v) => ({ description: v.description, costEstimate: v.costEstimate.toNumber() })),
    job: { customerName: job.customerName, siteName: job.siteName, siteAddress: job.siteAddress, jobType: job.jobType },
    businessProfile: {
      name: businessProfile?.name ?? "CT Field Ops",
      abn: businessProfile?.abn ?? "",
      address: businessProfile?.address ?? "",
      logoUrl: businessProfile?.logoUrl ?? null,
      paymentTerms: businessProfile?.paymentTerms ?? null,
    },
  });

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoiceNumber}.pdf"`,
    },
  });
}
