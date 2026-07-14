import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateCreateAssetInput } from "@/lib/assets/validate";
import { getCustomerById } from "@/lib/customers/queries";

export async function GET(req: Request) {
  const user = await requireRole(["admin", "director", "sales_engineer", "service_manager"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId");

  const assets = await db.asset.findMany({
    where: customerId ? { customerId } : undefined,
    orderBy: { serialNumber: "asc" },
    take: 200,
  });

  return NextResponse.json(assets);
}

export async function POST(req: Request) {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateCreateAssetInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const customer = await getCustomerById(parsed.data.customerId);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const asset = await db.asset.create({ data: parsed.data });
  return NextResponse.json(asset, { status: 201 });
}
