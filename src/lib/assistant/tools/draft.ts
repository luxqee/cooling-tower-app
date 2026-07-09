import { db } from "@/lib/db/client";

interface CallingUser {
  id: string;
  role: string;
  name: string;
}

type ToolResult<T extends Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

const DRAFT_VARIATION_ROLES = ["director", "service_manager", "admin"];
const DRAFT_QUOTE_ROLES = ["admin", "director", "sales_engineer"];

export async function draftVariation(
  args: { jobId: string; technicianName: string; description: string; costEstimate: number },
  callingUser: CallingUser
): Promise<ToolResult<{ variationId: string }>> {
  if (!DRAFT_VARIATION_ROLES.includes(callingUser.role)) {
    return { ok: false, error: "Your role isn't permitted to draft a variation." };
  }

  const technician = await db.user.findFirst({
    where: { name: { contains: args.technicianName, mode: "insensitive" }, role: "technician" },
  });
  if (!technician) {
    return { ok: false, error: `Couldn't find a technician named "${args.technicianName}".` };
  }

  const job = await db.job.findFirst({ where: { id: args.jobId, status: { in: ["active", "scheduled"] } } });
  if (!job) {
    return { ok: false, error: "Job not found or not active." };
  }

  const assignment = await db.assignment.findFirst({ where: { userId: technician.id, jobId: args.jobId } });
  if (!assignment) {
    return { ok: false, error: `${technician.name} isn't assigned to this job.` };
  }

  const variation = await db.variation.create({
    data: {
      jobId: args.jobId,
      technicianId: technician.id,
      description: args.description,
      costEstimate: args.costEstimate,
      status: "pending",
    },
  });

  return { ok: true, variationId: variation.id };
}

export async function draftQuote(
  args: { customerName: string; siteName: string; jobType: string; lineItems: { description: string; qty: number; unitPrice: number }[] },
  callingUser: CallingUser
): Promise<ToolResult<{ quoteId: string }>> {
  if (!DRAFT_QUOTE_ROLES.includes(callingUser.role)) {
    return { ok: false, error: "Your role isn't permitted to draft a quote." };
  }

  const totalAmount = args.lineItems.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);

  const quote = await db.quote.create({
    data: {
      createdById: callingUser.id,
      customerName: args.customerName,
      siteName: args.siteName,
      jobType: args.jobType,
      lineItems: args.lineItems,
      totalAmount,
      status: "draft",
    },
  });

  return { ok: true, quoteId: quote.id };
}
