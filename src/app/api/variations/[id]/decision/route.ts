import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { sendPushToUser } from "@/lib/push/vapid";

const decisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approved") }),
  z.object({
    decision: z.literal("rejected"),
    decisionReason: z.string().min(10, "Reason must be at least 10 characters (VC-06)"),
  }),
  z.object({
    decision: z.literal("queried"),
    decisionReason: z.string().min(10, "Provide a query of at least 10 characters"),
  }),
]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid decision", issues: parsed.error.issues }, { status: 400 });
  }

  const variation = await db.variation.findUnique({ where: { id: params.id } });
  if (!variation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (variation.status !== "pending") {
    return NextResponse.json({ error: "Variation already decided" }, { status: 409 });
  }

  const { decision } = parsed.data;
  const decisionReason = "decisionReason" in parsed.data ? parsed.data.decisionReason : null;

  const updated = await db.$transaction(async (tx) => {
    const updated = await tx.variation.update({
      where: { id: params.id },
      data: {
        status: decision,
        directorDecision: decision,
        decisionReason,
        decidedAt: new Date(),
      },
    });

    if (decision === "approved") {
      const existing = await tx.invoice.findFirst({ where: { jobId: variation.jobId } });
      if (existing) {
        await tx.invoice.update({
          where: { id: existing.id },
          data: {
            variationsTotal: existing.variationsTotal + variation.costEstimate,
            totalAmount: existing.totalAmount + variation.costEstimate,
          },
        });
      } else {
        await tx.invoice.create({
          data: {
            jobId: variation.jobId,
            baseAmount: 0,
            variationsTotal: variation.costEstimate,
            totalAmount: variation.costEstimate,
          },
        });
      }
    }

    return updated;
  });

  const technician = await db.user.findUnique({
    where: { id: variation.technicianId },
    include: { pushSubscriptions: true },
  });

  if (technician) {
    const messages: Record<string, string> = {
      approved: "Variation approved",
      rejected: "Variation rejected",
      queried: "Director has a query on your variation",
    };
    await Promise.allSettled(
      technician.pushSubscriptions.map((sub) =>
        sendPushToUser(sub, {
          title: messages[decision],
          body: decisionReason ?? `$${variation.costEstimate.toFixed(0)}`,
          url: "/variations",
        })
      )
    );
  }

  return NextResponse.json(updated);
}
