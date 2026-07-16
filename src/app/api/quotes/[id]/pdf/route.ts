import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { generateQuotePdf } from "@/lib/quoting/generateQuotePdf";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director", "sales_engineer"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [quote, businessProfile] = await Promise.all([
    db.quote.findUnique({ where: { id: params.id } }),
    db.businessProfile.findFirst(),
  ]);
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const pdfBuffer = await generateQuotePdf({
    quote: {
      customerName: quote.customerName,
      siteName: quote.siteName,
      jobType: quote.jobType,
      lineItems: quote.lineItems as { description: string; qty: number; unitPrice: number }[],
      totalAmount: quote.totalAmount.toNumber(),
      validUntil: quote.validUntil?.toISOString() ?? null,
      createdAt: quote.createdAt.toISOString(),
    },
    businessProfile: {
      name: businessProfile?.name ?? "Your Business",
      abn: businessProfile?.abn ?? "",
      address: businessProfile?.address ?? "",
      logoUrl: businessProfile?.logoUrl ?? null,
      paymentTerms: businessProfile?.paymentTerms ?? null,
    },
  });

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="quote-${quote.id.slice(0, 8)}.pdf"`,
    },
  });
}
