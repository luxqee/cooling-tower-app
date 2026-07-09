import { NextResponse } from "next/server";
import { z } from "zod";
import { put } from "@vercel/blob";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { generatePdf } from "@/lib/compliance/generatePdf";

const docSchema = z.object({
  jobId:      z.string().uuid("Invalid jobId"),
  templateId: z.string().uuid("Invalid templateId"),
  values:     z.record(z.string(), z.any()),
});

export async function GET() {
  const user = await requireRole(["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let where;
  if (user.role === "technician") {
    const assignments = await db.assignment.findMany({ where: { userId: user.id } });
    const jobIds = assignments.map((a) => a.jobId);
    where = { jobId: { in: jobIds } };
  }

  const docs = await db.complianceDocument.findMany({
    where,
    include: {
      template:  { select: { name: true, type: true } },
      job:       { select: { customerName: true, siteName: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return NextResponse.json(docs);
}

export async function POST(req: Request) {
  const user = await requireRole(["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = docSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { jobId, templateId, values } = parsed.data;

  const template = await db.complianceTemplate.findUnique({ where: { id: templateId, isActive: true } });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  let document = await db.complianceDocument.create({
    data: { jobId, templateId, createdById: user.id, values: values ?? {} },
  });

  try {
    const businessProfile = await db.businessProfile.findFirst();
    const pdfBuffer = await generatePdf({ document, template, job, createdBy: { ...user, phone: "", createdAt: new Date() } as any, businessName: businessProfile?.name, logoUrl: businessProfile?.logoUrl });
    const blob = await put(`compliance/${document.id}.pdf`, pdfBuffer, { access: "private", contentType: "application/pdf" });

    document = await db.complianceDocument.update({
      where: { id: document.id },
      data:  { pdfUrl: blob.url },
      include: {
        template:  { select: { name: true, type: true } },
        job:       { select: { customerName: true, siteName: true } },
        createdBy: { select: { name: true } },
      },
    });
  } catch {
    await db.complianceDocument.delete({ where: { id: document.id } }).catch(() => {});
    return NextResponse.json({ error: "Failed to generate PDF. Please try again." }, { status: 500 });
  }

  return NextResponse.json(document, { status: 201 });
}
