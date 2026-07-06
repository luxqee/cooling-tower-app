import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET() {
  const user = await requireRole(["sales_engineer", "director", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.job.groupBy({
    by: ["jobType"],
    where: { status: "complete" },
    orderBy: { jobType: "asc" },
  });

  return NextResponse.json({ jobTypes: rows.map((r) => r.jobType) });
}
