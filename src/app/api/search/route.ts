import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const CUSTOMER_SEARCH_ROLES = ["admin", "director", "sales_engineer"];

export async function GET(req: Request) {
  const user = await requireRole(["director", "service_manager", "admin", "sales_engineer"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ jobs: [], customers: [] });

  const jobs = await db.job.findMany({
    where: {
      OR: [
        { customerName: { contains: q, mode: "insensitive" } },
        { siteName: { contains: q, mode: "insensitive" } },
        { jobType: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, customerName: true, siteName: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  let customers: { id: string; name: string; contactPerson: string | null }[] = [];
  if (CUSTOMER_SEARCH_ROLES.includes(user.role)) {
    customers = await db.customer.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, contactPerson: true },
      orderBy: { name: "asc" },
      take: 6,
    });
  }

  return NextResponse.json({ jobs, customers });
}
