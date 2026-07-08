import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const patchCustomerSchema = z.object({
  name:          z.string().min(2).optional(),
  abn:           z.string().nullable().optional(),
  contactPerson: z.string().nullable().optional(),
  email:         z.string().email().nullable().optional(),
  phone:         z.string().nullable().optional(),
  address:       z.string().nullable().optional(),
  notes:         z.string().nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director", "sales_engineer"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const customer = await db.customer.findUnique({
    where: { id: params.id },
    include: {
      jobs: {
        select: {
          id: true, customerName: true, siteName: true,
          status: true, createdAt: true, jobType: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...customer,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
    jobs: customer.jobs.map((j) => ({ ...j, createdAt: j.createdAt.toISOString() })),
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const existing = await db.customer.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let updated;
  try {
    updated = await db.$transaction(async (tx) => {
      const customer = await tx.customer.update({ where: { id: params.id }, data: parsed.data });
      if (parsed.data.name !== undefined) {
        await tx.job.updateMany({
          where: { customerId: params.id },
          data: { customerName: parsed.data.name },
        });
      }
      return customer;
    });
  } catch (e: any) {
    if (e?.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await db.customer.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await db.$transaction(async (tx) => {
      await tx.job.updateMany({ where: { customerId: params.id }, data: { customerId: null } });
      await tx.customer.delete({ where: { id: params.id } });
    });
  } catch (e: any) {
    if (e?.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  return new NextResponse(null, { status: 204 });
}
