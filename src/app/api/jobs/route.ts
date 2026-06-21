import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const createJobSchema = z.object({
  customerName: z.string().min(2, "Customer name required"),
  siteName: z.string().min(2, "Site name required"),
  siteAddress: z.string().min(5, "Site address required"),
  quotedHours: z.number().positive("Quoted hours must be greater than 0"),
  status: z.enum(["scheduled", "active"]).default("scheduled"),
});

export async function POST(req: Request) {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const job = await db.job.create({ data: parsed.data });
  return NextResponse.json(job, { status: 201 });
}
