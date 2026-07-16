import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { checkRateLimit } from "@/lib/rateLimit";
import { getActiveJobs } from "@/lib/jobs/queries";
import { findAssignments } from "@/lib/assistant/tools/read";
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

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
