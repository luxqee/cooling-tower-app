import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { checkRateLimit } from "@/lib/rateLimit";
import { getActiveJobs } from "@/lib/jobs/queries";
import { findJobs, findAssignments } from "@/lib/assistant/tools/read";
import { getPendingVariations } from "@/lib/variations/queries";
import { getUnpaidInvoices } from "@/lib/invoicing/queries";
import { weekStart } from "@/lib/schedule/dateUtils";

const QUICK_ACTION_ROLES = ["director", "service_manager", "admin", "sales_engineer"] as const;

function formatActiveJobs(jobs: Awaited<ReturnType<typeof getActiveJobs>>): string {
  if (jobs.length === 0) return "No active or scheduled jobs.";
  const lines = jobs.map((j) => `- **${j.customerName}** — ${j.siteName} (${j.status})`);
  return ["**Active & scheduled jobs:**", "", ...lines].join("\n");
}

function formatWeekAssignments(assignments: Awaited<ReturnType<typeof findAssignments>>): string {
  if (assignments.length === 0) return "No assignments this week.";
  const lines = assignments.map(
    (a) => `- **${a.technicianName}** — ${a.customerName} (${a.siteName}), ${new Date(a.assignedDate).toLocaleDateString("en-AU")}`
  );
  return ["**This week's assignments:**", "", ...lines].join("\n");
}

function formatOverdueJobs(jobs: Awaited<ReturnType<typeof findJobs>>): string {
  if (jobs.length === 0) return "No jobs currently over their quoted hours.";
  const lines = jobs.map((j) => `- **${j.customerName}** — ${j.siteName} (quoted ${j.quotedHours}h)`);
  return ["**Jobs over quoted hours:**", "", ...lines].join("\n");
}

function formatPendingVariations(variations: Awaited<ReturnType<typeof getPendingVariations>>): string {
  if (variations.length === 0) return "No variations awaiting a decision.";
  const lines = variations.map(
    (v) => `- **${v.job.customerName}** — ${v.job.siteName}: ${v.description} ($${v.costEstimate.toNumber().toFixed(0)}, submitted by ${v.technician.name})`
  );
  return ["**Variations awaiting your decision:**", "", ...lines].join("\n");
}

function formatUnpaidInvoices(invoices: Awaited<ReturnType<typeof getUnpaidInvoices>>): string {
  if (invoices.length === 0) return "No unpaid invoices — everything sent has been paid.";
  const lines = invoices.map(
    (i) => `- **${i.invoiceNumber ?? "Draft"}** — ${i.job.customerName} (${i.job.siteName}): $${i.totalAmount.toNumber().toFixed(0)}${i.sentAt ? `, sent ${new Date(i.sentAt).toLocaleDateString("en-AU")}` : ""}`
  );
  return ["**Unpaid invoices:**", "", ...lines].join("\n");
}

export async function POST(req: Request) {
  const user = await requireRole(QUICK_ACTION_ROLES).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(`quick-action:${user.id}`))) {
    return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
  }

  const body = await req.json();
  const action = body?.action;

  if (action === "activeJobs") {
    const jobs = await getActiveJobs();
    return NextResponse.json({ reply: formatActiveJobs(jobs) });
  }

  if (action === "weekAssignments") {
    const monday = weekStart(new Date());
    const weekEnd = new Date(monday);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const assignments = await findAssignments({
      dateFrom: monday.toISOString(),
      dateTo: weekEnd.toISOString(),
    });
    return NextResponse.json({ reply: formatWeekAssignments(assignments) });
  }

  if (action === "overdueJobs") {
    const jobs = await findJobs({ overdueOnly: true });
    return NextResponse.json({ reply: formatOverdueJobs(jobs) });
  }

  if (action === "pendingVariations") {
    const variations = await getPendingVariations();
    return NextResponse.json({ reply: formatPendingVariations(variations) });
  }

  if (action === "unpaidInvoices") {
    const invoices = await getUnpaidInvoices({ take: 20 });
    return NextResponse.json({ reply: formatUnpaidInvoices(invoices) });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
