import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateCreateContractInput, calculateRenewalDate } from "@/lib/contracts/validate";
import { getCustomerById } from "@/lib/customers/queries";

export async function GET() {
  const user = await requireRole(["admin", "director", "service_manager"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contracts = await db.contract.findMany({ orderBy: { renewalDate: "asc" }, take: 200 });

  return NextResponse.json(contracts.map((c) => ({ ...c, value: c.value.toNumber() })));
}

export async function POST(req: Request) {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateCreateContractInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const customer = await getCustomerById(parsed.data.customerId);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const startDate = new Date(parsed.data.startDate);
  const renewalDate = calculateRenewalDate(startDate, parsed.data.billingCadence);

  const contract = await db.contract.create({
    data: {
      customerId: parsed.data.customerId,
      siteName: parsed.data.siteName,
      value: parsed.data.value,
      billingCadence: parsed.data.billingCadence,
      serviceIntervalDays: parsed.data.serviceIntervalDays,
      startDate,
      renewalDate,
      status: "active",
    },
  });

  return NextResponse.json({ ...contract, value: contract.value.toNumber() }, { status: 201 });
}
