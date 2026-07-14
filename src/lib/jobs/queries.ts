import { db } from "@/lib/db/client";
import type { Job } from "@prisma/client";

interface CallingUser {
  id: string;
  role: string;
}

const JOB_LIST_SELECT = {
  id: true,
  customerName: true,
  siteName: true,
  siteAddress: true,
  status: true,
} as const;

/** Every currently-workable job, company-wide. No user-scoping — for aggregate/report views. */
export async function getActiveJobs() {
  return db.job.findMany({
    where: { status: { in: ["active", "scheduled"] } },
    select: JOB_LIST_SELECT,
    orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
  });
}

/**
 * Jobs this specific user may pick from when creating a record against a job
 * (assigning a technician, logging a variation, submitting a compliance doc).
 * Technicians see only jobs they're assigned to; every other role sees the
 * same company-wide list as getActiveJobs().
 */
export async function getJobsAssignableToUser(user: CallingUser) {
  if (user.role !== "technician") return getActiveJobs();

  return db.job.findMany({
    where: {
      status: { in: ["active", "scheduled"] },
      assignments: { some: { userId: user.id } },
    },
    select: JOB_LIST_SELECT,
    orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
  });
}

/** Single active/scheduled job by id, or null if missing/not currently workable. */
export async function getActiveJobById(id: string): Promise<Job | null> {
  return db.job.findFirst({ where: { id, status: { in: ["active", "scheduled"] } } });
}

/** Active/scheduled jobs with quoted vs. logged hours, for company-wide hours reporting. */
export async function getActiveJobsWithHours() {
  return db.job.findMany({
    where: { status: { in: ["active", "scheduled"] } },
    select: {
      id: true,
      customerName: true,
      siteName: true,
      quotedHours: true,
      timeEntries: {
        where: { status: "complete" },
        select: { durationMinutes: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
