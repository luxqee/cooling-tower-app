import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { toCsv, csvResponse } from "@/lib/export/csv";

export async function GET() {
  const user = await requireRole(["director", "admin"]).catch(() => null);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const jobs = await db.job.findMany({ orderBy: { createdAt: "desc" } });

  const csv = toCsv(
    ["Customer", "Site Name", "Site Address", "Job Type", "Status", "Quoted Hours", "Quoted Cost", "Created"],
    jobs.map((j) => [j.customerName, j.siteName, j.siteAddress, j.jobType, j.status, j.quotedHours, j.quotedCost, j.createdAt]),
  );

  return csvResponse("jobs.csv", csv);
}
