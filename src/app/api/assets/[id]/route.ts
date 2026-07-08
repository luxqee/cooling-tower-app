import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director", "sales_engineer", "service_manager", "technician"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const asset = await db.asset.findUnique({
    where: { id: params.id },
    include: {
      jobs: {
        include: { job: { select: { id: true, siteName: true, status: true, createdAt: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const { jobs, ...rest } = asset as typeof asset & { jobs: { job: unknown }[] };
  return NextResponse.json({ ...rest, jobs: jobs.map((j) => j.job) });
}
