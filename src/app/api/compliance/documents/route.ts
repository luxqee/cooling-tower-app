import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { generatePdf } from "@/lib/compliance/generatePdf";

export async function GET() {
  const user = await requireRole(["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const docs = await db.complianceDocument.findMany({
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

  const { jobId, templateId, values } = await req.json();

  const template = await db.complianceTemplate.findUnique({ where: { id: templateId, isActive: true } });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const document = await db.complianceDocument.create({
    data: { jobId, templateId, createdById: user.id, values: values ?? {} },
  });

  const pdfBuffer = await generatePdf({ document, template, job, createdBy: { ...user, phone: "", createdAt: new Date() } as any });
  const blob = await put(`compliance/${document.id}.pdf`, pdfBuffer, { access: "private", contentType: "application/pdf" });

  const updated = await db.complianceDocument.update({
    where: { id: document.id },
    data:  { pdfUrl: blob.url },
    include: {
      template:  { select: { name: true, type: true } },
      job:       { select: { customerName: true, siteName: true } },
      createdBy: { select: { name: true } },
    },
  });

  return NextResponse.json(updated, { status: 201 });
}
