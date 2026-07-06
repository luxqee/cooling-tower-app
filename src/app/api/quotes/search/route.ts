import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET(req: Request) {
  const user = await requireRole(["sales_engineer", "director", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobType      = searchParams.get("jobType")      ?? "";
  const customerName = searchParams.get("customerName") ?? "";
  const dateFrom     = searchParams.get("dateFrom")     ?? "";
  const dateTo       = searchParams.get("dateTo")       ?? "";

  const jobs = await db.job.findMany({
    where: {
      status: "complete",
      ...(jobType ? { jobType } : {}),
      ...(customerName
        ? { customerName: { contains: customerName, mode: "insensitive" } }
        : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo   ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    },
    include: {
      timeEntries: { where: { status: "complete" }, select: { durationMinutes: true } },
      variations:  { where: { status: "approved" }, select: { costEstimate: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const rows = jobs.map((job) => {
    const actualMinutes = job.timeEntries.reduce(
      (sum, e) => sum + (e.durationMinutes ?? 0),
      0
    );
    const actualHours = Math.round((actualMinutes / 60) * 10) / 10;
    const overagePct =
      job.quotedHours === 0
        ? null
        : Math.round(((actualHours - job.quotedHours) / job.quotedHours) * 1000) / 10;
    const variationTotal = job.variations.reduce(
      (sum, v) => sum + Number(v.costEstimate),
      0
    );
    return {
      id:             job.id,
      customerName:   job.customerName,
      siteName:       job.siteName,
      siteAddress:    job.siteAddress,
      jobType:        job.jobType,
      quotedHours:    job.quotedHours,
      actualHours,
      overagePct,
      variationCount: job.variations.length,
      variationTotal,
      createdAt:      job.createdAt.toISOString(),
    };
  });

  const nonNullOverages = rows.filter(
    (r): r is typeof rows[0] & { overagePct: number } => r.overagePct !== null
  );

  const count = rows.length;
  const stats = {
    count,
    avgQuotedHours:
      count === 0
        ? 0
        : Math.round((rows.reduce((s, r) => s + r.quotedHours, 0) / count) * 10) / 10,
    avgActualHours:
      count === 0
        ? 0
        : Math.round((rows.reduce((s, r) => s + r.actualHours, 0) / count) * 10) / 10,
    avgOveragePct:
      nonNullOverages.length === 0
        ? null
        : Math.round(
            (nonNullOverages.reduce((s, r) => s + r.overagePct, 0) / nonNullOverages.length) * 10
          ) / 10,
    avgVariationTotal:
      count === 0
        ? 0
        : Math.round((rows.reduce((s, r) => s + r.variationTotal, 0) / count) * 100) / 100,
  };

  return NextResponse.json({ jobs: rows, stats });
}
