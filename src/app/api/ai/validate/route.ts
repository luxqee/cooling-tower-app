import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateAiValidateInput, checkImplausibleValues, type AiFlag } from "@/lib/ai/validate-job";

export async function POST(req: Request) {
  const user = await requireRole(["admin", "director", "service_manager"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = validateAiValidateInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const input = parsed.data;

  // Rule layer 1 — duplicate-site detection. Free, instant, runs first.
  const duplicate = await db.job.findFirst({
    where: {
      siteName: { equals: input.siteName, mode: "insensitive" },
      NOT: { customerName: { equals: input.customerName, mode: "insensitive" } },
    },
  });
  if (duplicate) {
    const flags: AiFlag[] = [{
      field: "siteName",
      severity: "warning",
      message: `A job at "${input.siteName}" already exists under a different customer name. Check this isn't a duplicate or a typo.`,
      suggestion: null,
    }];
    return NextResponse.json({ flags });
  }

  // Rule layer 2 — bounds check against the business's own configured hourly
  // rate. Free, instant, no external API call — deterministic outliers like
  // a mistyped hours/cost figure don't need an LLM round-trip to catch.
  const businessProfile = await db.businessProfile.findFirst();
  const flags = checkImplausibleValues(input, businessProfile?.hourlyRate ?? null);
  return NextResponse.json({ flags });
}
