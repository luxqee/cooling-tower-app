import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const linkJobSchema = z.object({ jobId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director", "service_manager"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = linkJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const job = await db.job.findUnique({ where: { id: parsed.data.jobId } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const jobAsset = await db.jobAsset.create({
    data: { jobId: parsed.data.jobId, assetId: params.id },
  });

  return NextResponse.json(jobAsset, { status: 201 });
}
