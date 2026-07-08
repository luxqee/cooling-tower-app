import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateCreateQuoteInput, calculateQuoteTotal } from "@/lib/quoting/validate";

export async function GET() {
  const user = await requireRole(["admin", "director", "sales_engineer"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const quotes = await db.quote.findMany({ orderBy: { createdAt: "desc" } });

  return NextResponse.json(quotes.map((q) => ({ ...q, totalAmount: q.totalAmount.toNumber() })));
}

export async function POST(req: Request) {
  const user = await requireRole(["admin", "director", "sales_engineer"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateCreateQuoteInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const totalAmount = calculateQuoteTotal(parsed.data.lineItems);

  const quote = await db.quote.create({
    data: {
      createdById: user.id,
      customerName: parsed.data.customerName,
      siteName: parsed.data.siteName,
      jobType: parsed.data.jobType,
      lineItems: parsed.data.lineItems,
      totalAmount,
      status: "draft",
      validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
    },
  });

  return NextResponse.json({ ...quote, totalAmount: quote.totalAmount.toNumber() }, { status: 201 });
}
