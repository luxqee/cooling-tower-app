import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

/** Converts a Prisma Decimal or plain number to a JS number. */
const toNum = (v: any): number => (typeof v?.toNumber === "function" ? v.toNumber() : Number(v));

const patchSchema = z.object({
  baseAmount: z.number().nonnegative().optional(),
  notes: z.string().nullable().optional(),
  status: z.literal("paid").optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoice = await db.invoice.findUnique({
    where: { id: params.id },
    include: {
      job: {
        select: {
          id: true, customerName: true, siteName: true, siteAddress: true, jobType: true,
          timeEntries: { where: { status: "complete" }, select: { durationMinutes: true } },
          variations: {
            where: { status: "approved" },
            select: { id: true, description: true, costEstimate: true, decidedAt: true },
          },
        },
      },
    },
  });

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    baseAmount: toNum(invoice.baseAmount),
    variationsTotal: toNum(invoice.variationsTotal),
    totalAmount: toNum(invoice.totalAmount),
    notes: invoice.notes,
    sentAt: invoice.sentAt?.toISOString() ?? null,
    sentToEmail: invoice.sentToEmail,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    createdAt: invoice.createdAt.toISOString(),
    job: {
      ...invoice.job,
      variations: invoice.job.variations.map((v) => ({
        id: v.id,
        description: v.description,
        costEstimate: toNum(v.costEstimate),
        decidedAt: v.decidedAt?.toISOString() ?? null,
      })),
    },
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  if (parsed.data.status === "paid" && user.role !== "director") {
    return NextResponse.json({ error: "Only directors can mark invoices as paid" }, { status: 403 });
  }

  const existing = await db.invoice.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.$transaction(async (tx) => {
    let invoiceNumber = existing.invoiceNumber;
    if (!invoiceNumber) {
      const count = await tx.invoice.count({ where: { invoiceNumber: { not: null } } });
      invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
    }

    const newBaseAmount = parsed.data.baseAmount !== undefined ? parsed.data.baseAmount : toNum(existing.baseAmount);
    const totalAmount = newBaseAmount + toNum(existing.variationsTotal);

    return tx.invoice.update({
      where: { id: params.id },
      data: {
        invoiceNumber,
        ...(parsed.data.baseAmount !== undefined ? { baseAmount: parsed.data.baseAmount, totalAmount } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        ...(parsed.data.status === "paid" ? { status: "paid", paidAt: new Date() } : {}),
      },
    });
  });

  return NextResponse.json({
    id: updated.id,
    invoiceNumber: updated.invoiceNumber,
    status: updated.status,
    baseAmount: toNum(updated.baseAmount),
    variationsTotal: toNum(updated.variationsTotal),
    totalAmount: toNum(updated.totalAmount),
    notes: updated.notes,
    sentAt: updated.sentAt?.toISOString() ?? null,
    sentToEmail: updated.sentToEmail,
    paidAt: updated.paidAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
}
