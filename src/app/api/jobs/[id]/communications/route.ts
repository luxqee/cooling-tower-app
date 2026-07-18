import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateCommunicationInput } from "@/lib/communications/validate";
import { indexDocument } from "@/lib/ai/semanticSearch";

const OFFICE_ROLES = ["admin", "director", "service_manager"] as const;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole([...OFFICE_ROLES, "technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = params.id;

  if (user.role === "technician") {
    const assignment = await db.assignment.findFirst({ where: { userId: user.id, jobId } });
    if (!assignment) {
      return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });
    }
    const communications = await db.jobCommunication.findMany({
      where: { jobId, type: "field_instruction" },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json(communications);
  }

  const communications = await db.jobCommunication.findMany({
    where: { jobId },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
    take: 200,
  });
  return NextResponse.json(communications);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole([...OFFICE_ROLES]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateCommunicationInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const jobId = params.id;
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const communication = await db.jobCommunication.create({
    data: {
      jobId,
      authorId: user.id,
      type: parsed.data.type,
      body: parsed.data.body,
    },
  });

  try {
    await indexDocument("JobCommunication", communication.id, jobId, communication.body);
  } catch (err) {
    console.error("Failed to index job communication for semantic search:", err);
    Sentry.captureException(err);
  }

  return NextResponse.json(communication, { status: 201 });
}
