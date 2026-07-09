import { db } from "@/lib/db/client";
import { semanticSearch } from "@/lib/ai/semanticSearch";

export async function findJobs(args: {
  status?: string;
  siteName?: string;
  customerName?: string;
  overdueOnly?: boolean;
}) {
  const where: Record<string, unknown> = {};
  if (args.status) where.status = args.status;
  if (args.siteName) where.siteName = { contains: args.siteName, mode: "insensitive" };
  if (args.customerName) where.customerName = { contains: args.customerName, mode: "insensitive" };
  if (args.overdueOnly) {
    where.status = "active";

    // Overdue = active job whose logged hours (sum of TimeEntry.durationMinutes / 60)
    // exceed Job.quotedHours. This can't be expressed as a Prisma `where` filter
    // (it's an aggregate comparison), so fetch a generous batch of active jobs
    // matching the other filters, compute logged hours in app code, filter, then
    // cap at 20 so filtering doesn't truncate before we know which are overdue.
    const candidates = await db.job.findMany({
      where,
      select: {
        id: true,
        customerName: true,
        siteName: true,
        status: true,
        quotedHours: true,
        jobType: true,
        timeEntries: { select: { durationMinutes: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return candidates
      .filter((job) => {
        const loggedMinutes = job.timeEntries.reduce((sum, te) => sum + (te.durationMinutes ?? 0), 0);
        const loggedHours = loggedMinutes / 60;
        return loggedHours > job.quotedHours;
      })
      .slice(0, 20)
      .map(({ timeEntries: _timeEntries, ...job }) => job);
  }

  const jobs = await db.job.findMany({
    where,
    select: { id: true, customerName: true, siteName: true, status: true, quotedHours: true, jobType: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return jobs;
}

export async function findComplianceDocuments(args: { jobId?: string; missingTemplateType?: string }) {
  const templates = await db.complianceTemplate.findMany({
    where: { isActive: true, ...(args.missingTemplateType ? { type: args.missingTemplateType } : {}) },
    select: { id: true, name: true, type: true },
  });

  if (!args.jobId) {
    return templates.map((t) => ({ templateId: t.id, templateName: t.name }));
  }

  const submitted = await db.complianceDocument.findMany({
    where: { jobId: args.jobId },
    select: { templateId: true },
  });
  const submittedIds = new Set(submitted.map((s) => s.templateId));

  return templates
    .filter((t) => !submittedIds.has(t.id))
    .map((t) => ({ templateId: t.id, templateName: t.name }));
}

export async function findAssignments(args: { technicianName?: string; siteId?: string; dateFrom?: string; dateTo?: string }) {
  const where: Record<string, unknown> = {};
  if (args.technicianName) where.user = { name: { contains: args.technicianName, mode: "insensitive" } };
  if (args.dateFrom || args.dateTo) {
    where.assignedDate = {
      ...(args.dateFrom ? { gte: new Date(args.dateFrom) } : {}),
      ...(args.dateTo ? { lte: new Date(args.dateTo) } : {}),
    };
  }

  const assignments = await db.assignment.findMany({
    where,
    include: { user: { select: { name: true } }, job: { select: { customerName: true, siteName: true } } },
    take: 20,
    orderBy: { assignedDate: "desc" },
  });

  return assignments.map((a) => ({
    technicianName: a.user.name,
    customerName: a.job.customerName,
    siteName: a.job.siteName,
    assignedDate: a.assignedDate.toISOString(),
  }));
}

// sales_engineer can't read JobCommunication via the direct API
// (jobs/[id]/communications restricts it to admin/director/service_manager +
// the assigned technician), so the assistant must not surface that content
// to them either — only VoiceNote transcript matches are safe to return.
const JOB_COMMUNICATION_BLOCKED_ROLES = ["sales_engineer"];

export async function semanticSearchTool(args: { query: string; jobId?: string }, callingUser: { role: string }) {
  const results = await semanticSearch(args.query, args.jobId);
  const filtered = JOB_COMMUNICATION_BLOCKED_ROLES.includes(callingUser.role)
    ? results.filter((r) => r.sourceType !== "JobCommunication")
    : results;
  return filtered.map((r) => ({ sourceType: r.sourceType, jobId: r.jobId, chunkText: r.chunkText, relevance: 1 - r.distance }));
}
