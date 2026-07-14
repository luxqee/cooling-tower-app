// src/lib/jobs/__tests__/queries.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: { job: { findMany: vi.fn(), findFirst: vi.fn() } },
}));

import { db } from "@/lib/db/client";
import { getActiveJobs, getJobsAssignableToUser, getActiveJobById, getActiveJobsWithHours } from "../queries";

const JOB_LIST_SELECT = {
  id: true,
  customerName: true,
  siteName: true,
  siteAddress: true,
  status: true,
};

beforeEach(() => vi.clearAllMocks());

describe("getActiveJobs", () => {
  it("queries active/scheduled jobs with the picker select shape", async () => {
    vi.mocked(db.job.findMany).mockResolvedValue([{ id: "j1" }] as any);
    const result = await getActiveJobs();
    expect(db.job.findMany).toHaveBeenCalledWith({
      where: { status: { in: ["active", "scheduled"] } },
      select: JOB_LIST_SELECT,
      orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
    });
    expect(result).toEqual([{ id: "j1" }]);
  });
});

describe("getJobsAssignableToUser", () => {
  it("scopes to the technician's own assignments", async () => {
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    await getJobsAssignableToUser({ id: "u1", role: "technician" });
    expect(db.job.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["active", "scheduled"] },
        assignments: { some: { userId: "u1" } },
      },
      select: JOB_LIST_SELECT,
      orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
    });
  });

  it("returns all active/scheduled jobs for a non-technician role", async () => {
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    await getJobsAssignableToUser({ id: "u2", role: "director" });
    expect(db.job.findMany).toHaveBeenCalledWith({
      where: { status: { in: ["active", "scheduled"] } },
      select: JOB_LIST_SELECT,
      orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
    });
  });
});

describe("getActiveJobById", () => {
  it("queries by id scoped to active/scheduled status", async () => {
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "j1" } as any);
    const result = await getActiveJobById("j1");
    expect(db.job.findFirst).toHaveBeenCalledWith({
      where: { id: "j1", status: { in: ["active", "scheduled"] } },
    });
    expect(result).toEqual({ id: "j1" });
  });

  it("returns null when the job doesn't exist or isn't active", async () => {
    vi.mocked(db.job.findFirst).mockResolvedValue(null);
    const result = await getActiveJobById("missing");
    expect(result).toBeNull();
  });
});

describe("getActiveJobsWithHours", () => {
  it("queries active/scheduled jobs with hours and completed time entries", async () => {
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    await getActiveJobsWithHours();
    expect(db.job.findMany).toHaveBeenCalledWith({
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
  });
});
