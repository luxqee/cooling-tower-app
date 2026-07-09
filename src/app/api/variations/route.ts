import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateVariationInput } from "@/lib/variations/validate";
import { sendPushToUser } from "@/lib/push/vapid";
import { notifyUsers } from "@/lib/notifications/create";

export async function GET() {
  const user = await requireRole(["director", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const variations = await db.variation.findMany({
    where: { status: "pending" },
    include: {
      technician: { select: { name: true } },
      job: { select: { customerName: true, siteName: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return NextResponse.json(
    variations.map((v) => ({
      ...v,
      costEstimate: v.costEstimate.toNumber(),
    }))
  );
}

export async function POST(req: Request) {
  const user = await requireRole(["technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateVariationInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const { jobId, description, costEstimate, photoUrl } = parsed.data;

  const job = await db.job.findFirst({
    where: { id: jobId, status: { in: ["active", "scheduled"] } },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found or not active" }, { status: 404 });
  }

  // Security: technician must be assigned to the job to submit a variation
  const assignment = await db.assignment.findFirst({
    where: { userId: user.id, jobId },
  });
  if (!assignment) {
    return NextResponse.json({ error: "Not assigned to this job" }, { status: 403 });
  }

  const variation = await db.variation.create({
    data: {
      jobId,
      technicianId: user.id,
      description,
      costEstimate,
      photoUrl: photoUrl ?? null,
      status: "pending",
    },
    include: { job: { select: { customerName: true, siteName: true } } },
  });

  const directors = await db.user.findMany({
    where: { role: "director", isActive: true },
    include: { pushSubscriptions: true },
  });

  const variationNotification = {
    title: "New Variation",
    body: `${user.name} — ${variation.job.siteName}: $${costEstimate.toFixed(0)}`,
    url: "/variations",
  };

  await notifyUsers(directors.map((d) => d.id), variationNotification);

  await Promise.allSettled(
    directors.flatMap((d) =>
      d.pushSubscriptions.map((sub) => sendPushToUser(sub, variationNotification))
    )
  );

  return NextResponse.json(
    { ...variation, costEstimate: variation.costEstimate.toNumber() },
    { status: 201 }
  );
}
