import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { generatePdf } from "@/lib/compliance/generatePdf";
import type { TemplateSections } from "@/lib/compliance/types";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const template = await db.complianceTemplate.findUnique({ where: { id: params.id, isActive: true } });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const businessProfile = await db.businessProfile.findFirst();

  // Build a mock document, job, and user — all values empty so fields show "—"
  const mockDoc = {
    id:          "preview",
    jobId:       "preview",
    templateId:  template.id,
    createdById: "preview",
    values:      {},
    pdfUrl:      null,
    submittedAt: null,
    createdAt:   new Date(),
  } as any;

  const mockJob = {
    id:           "preview",
    customerName: "Example Customer",
    siteName:     "Example Site",
    siteAddress:  "",
    status:       "active",
    quotedHours:  0,
    createdAt:    new Date(),
  } as any;

  const mockUser = {
    id:        user.id,
    clerkId:   user.clerkId,
    name:      user.name,
    email:     user.email,
    phone:     "",
    role:      user.role,
    isActive:  true,
    createdAt: new Date(),
  } as any;

  // Add "(Preview)" to the template name so the PDF is clearly identified
  const previewTemplate = {
    ...template,
    name: `${template.name} — Preview`,
    sections: template.sections as unknown as TemplateSections,
  } as any;

  const buffer = await generatePdf({
    document:     mockDoc,
    template:     previewTemplate,
    job:          mockJob,
    createdBy:    mockUser,
    businessName: businessProfile?.name,
  });

  const safeName = template.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="preview-${safeName}.pdf"`,
      "Cache-Control":       "no-store",
    },
  });
}
