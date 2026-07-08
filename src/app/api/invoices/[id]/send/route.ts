import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { generateInvoicePdf } from "@/lib/invoicing/generateInvoicePdf";
import { sendInvoiceEmail } from "@/lib/invoicing/sendInvoiceEmail";

const sendSchema = z.object({ email: z.string().email("Invalid email address") });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });

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

  // Ensure invoice number, generate PDF, send email — all in one transaction for the DB update
  const updated = await db.$transaction(async (tx) => {
    let { invoiceNumber } = invoice;
    if (!invoiceNumber) {
      const count = await tx.invoice.count();
      invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
    }

    const pdfData = {
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
    };

    const pdfBuffer = await generateInvoicePdf(pdfData);

    await sendInvoiceEmail({
      to: parsed.data.email,
      from: process.env.RESEND_FROM_EMAIL ?? `invoices@resend.dev`,
      invoiceNumber,
      jobDescription: `${job.jobType} — ${job.siteName}`,
      totalAmount: invoice.totalAmount.toNumber(),
      pdfBuffer,
      businessName: businessProfile?.name ?? "CT Field Ops",
    });

    return tx.invoice.update({
      where: { id: params.id },
      data: { invoiceNumber, status: "sent", sentAt: new Date(), sentToEmail: parsed.data.email },
    });
  });

  return NextResponse.json({
    sentAt: updated.sentAt?.toISOString() ?? null,
    sentToEmail: updated.sentToEmail,
  });
}
