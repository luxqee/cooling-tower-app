import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const createJobSchema = z.object({
  customerName: z.string().min(2, "Customer name required").optional(),
  customerId:   z.string().uuid().optional(),
  siteName:     z.string().min(2, "Site name required"),
  siteAddress:  z.string().min(5, "Site address required"),
  quotedHours:  z.number().positive("Quoted hours must be greater than 0"),
  quotedCost:   z.number().nonnegative().optional(),
  status:       z.enum(["scheduled", "active"]).default("scheduled"),
  jobType:      z.string().min(1, "Job type required"),
});

export async function POST(req: Request) {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  let { customerName, customerId, ...rest } = parsed.data;

  if (customerId) {
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    customerName = customer.name;
  } else if (!customerName || customerName.trim().length < 2) {
    return NextResponse.json({ error: "Customer name required" }, { status: 400 });
  }

  const job = await db.job.create({
    data: { ...rest, customerName: customerName!, customerId: customerId ?? null },
  });
  return NextResponse.json(job, { status: 201 });
}
