import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director", "service_manager"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contract = await db.contract.findUnique({
    where: { id: params.id },
    include: { customer: { select: { name: true, address: true } } },
  });
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  if (contract.status !== "active") {
    return NextResponse.json({ error: "Contract is not active" }, { status: 409 });
  }

  const job = await db.job.create({
    data: {
      contractId: contract.id,
      customerId: contract.customerId,
      customerName: contract.customer.name,
      siteName: contract.siteName,
      siteAddress: contract.customer.address ?? "",
      jobType: "Contract service",
      quotedHours: 1,
      status: "scheduled",
    },
  });

  return NextResponse.json(job, { status: 201 });
}
