import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const createCustomerSchema = z.object({
  name:          z.string().min(2, "Customer name required"),
  abn:           z.string().optional(),
  contactPerson: z.string().optional(),
  email:         z.string().email("Invalid email").optional(),
  phone:         z.string().optional(),
  address:       z.string().optional(),
  notes:         z.string().optional(),
});

export async function GET(req: Request) {
  const user = await requireRole(["admin", "director", "sales_engineer"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  const customers = await db.customer.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    select: { id: true, name: true, email: true, phone: true, abn: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(customers);
}

export async function POST(req: Request) {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const customer = await db.customer.create({ data: parsed.data });
  return NextResponse.json(customer, { status: 201 });
}
