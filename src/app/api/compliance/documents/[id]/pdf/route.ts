import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { generatePdf } from "@/lib/compliance/generatePdf";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await db.complianceDocument.findUnique({
    where: { id: params.id },
    include: {
      template: true,
      job: true,
      createdBy: true,
    },
  });

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const businessProfile = await db.businessProfile.findFirst();

  try {
    const pdfBuffer = await generatePdf({
      document: doc,
      template: doc.template,
      job: doc.job,
      createdBy: doc.createdBy,
      businessName: businessProfile?.name,
      logoUrl: businessProfile?.logoUrl,
    });

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="compliance-${doc.id}.pdf"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
