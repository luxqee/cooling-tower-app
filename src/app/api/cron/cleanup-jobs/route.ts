import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

// Called daily by Vercel Cron (see vercel.json).
// Deletes complete jobs that were last updated more than 30 days ago,
// along with all their child records (cascade must be done manually —
// no ON DELETE CASCADE in schema).
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const staleJobs = await db.job.findMany({
    where: { status: "complete", updatedAt: { lt: cutoff } },
    select: { id: true },
  });

  if (staleJobs.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  const ids = staleJobs.map((j) => j.id);

  await db.$transaction([
    db.complianceDocument.deleteMany({ where: { jobId: { in: ids } } }),
    db.jobCommunication.deleteMany({ where: { jobId: { in: ids } } }),
    db.materialEntry.deleteMany({ where: { jobId: { in: ids } } }),
    db.jobAsset.deleteMany({ where: { jobId: { in: ids } } }),
    db.timeEntry.deleteMany({ where: { jobId: { in: ids } } }),
    db.variation.deleteMany({ where: { jobId: { in: ids } } }),
    db.assignment.deleteMany({ where: { jobId: { in: ids } } }),
    db.invoice.deleteMany({ where: { jobId: { in: ids } } }),
    db.job.deleteMany({ where: { id: { in: ids } } }),
  ]);

  return NextResponse.json({ deleted: ids.length });
}
