import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { findMany: vi.fn(), groupBy: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET as GET_JOB_TYPES } from "../job-types/route";
import { GET as GET_SEARCH } from "../search/route";

const mockSalesEngineer = {
  id: "u1",
  role: "sales_engineer" as const,
  name: "Sam",
  clerkId: "c1",
  email: "s@e.com",
  isActive: true,
};

beforeEach(() => vi.clearAllMocks());

describe("GET /api/quotes/job-types", () => {
  it("returns 401 for technician role", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET_JOB_TYPES();
    expect(res.status).toBe(401);
  });

  it("returns 200 with sorted jobTypes for sales_engineer", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.groupBy).mockResolvedValue([
      { jobType: "Installation" },
      { jobType: "Service" },
    ] as any);
    const res = await GET_JOB_TYPES();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jobTypes).toEqual(["Installation", "Service"]);
  });
});

const baseJob = {
  id: "j1",
  customerName: "Rio Tinto",
  siteName: "Weipa Plant",
  siteAddress: "1 Main Rd, Weipa QLD 4874",
  jobType: "Installation",
  quotedHours: 10,
  quotedCost: null,
  status: "complete",
  createdAt: new Date("2026-01-15T00:00:00.000Z"),
  invoices: [],
};

function makeSearchReq(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/quotes/search");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

describe("GET /api/quotes/search", () => {
  it("returns 401 for technician role", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET_SEARCH(makeSearchReq());
    expect(res.status).toBe(401);
  });

  it("returns 401 for draftsman role", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET_SEARCH(makeSearchReq());
    expect(res.status).toBe(401);
  });

  it("returns 401 for service_manager role", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET_SEARCH(makeSearchReq());
    expect(res.status).toBe(401);
  });

  it("returns 200 with jobs and stats for sales_engineer", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    const res = await GET_SEARCH(makeSearchReq());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("jobs");
    expect(data).toHaveProperty("stats");
  });

  it("computes actualHours as sum(durationMinutes)/60 rounded to 1dp", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([
      { ...baseJob, timeEntries: [{ durationMinutes: 720 }], variations: [] },
    ] as any);
    const res = await GET_SEARCH(makeSearchReq());
    const data = await res.json();
    expect(data.jobs[0].actualHours).toBe(12.0);
  });

  it("overagePct is null when quotedHours is 0", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([
      { ...baseJob, quotedHours: 0, timeEntries: [], variations: [] },
    ] as any);
    const res = await GET_SEARCH(makeSearchReq());
    const data = await res.json();
    expect(data.jobs[0].overagePct).toBeNull();
  });

  it("overagePct is 20.0 when quotedHours=10 and actualHours=12", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([
      { ...baseJob, quotedHours: 10, timeEntries: [{ durationMinutes: 720 }], variations: [] },
    ] as any);
    const res = await GET_SEARCH(makeSearchReq());
    const data = await res.json();
    expect(data.jobs[0].overagePct).toBe(20.0);
  });

  it("passes jobType filter to Prisma where clause", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    await GET_SEARCH(makeSearchReq({ jobType: "Installation" }));
    const whereArg = vi.mocked(db.job.findMany).mock.calls[0]![0]!.where;
    expect(whereArg!.jobType).toBe("Installation");
  });

  it("passes customerName filter with case-insensitive mode", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    await GET_SEARCH(makeSearchReq({ customerName: "rio tinto" }));
    const whereArg = vi.mocked(db.job.findMany).mock.calls[0]![0]!.where;
    expect(whereArg!.customerName).toEqual({ contains: "rio tinto", mode: "insensitive" });
  });

  it("response job rows contain no technician identifiers", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([
      { ...baseJob, timeEntries: [], variations: [] },
    ] as any);
    const res = await GET_SEARCH(makeSearchReq());
    const data = await res.json();
    for (const row of data.jobs) {
      expect(row).not.toHaveProperty("technicianId");
      expect(row).not.toHaveProperty("userId");
      expect(Object.keys(row)).not.toContain("name");
      expect(row).not.toHaveProperty("email");
    }
  });

  it("stats.count equals number of returned jobs", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([
      { ...baseJob, quotedHours: 10, timeEntries: [], variations: [] },
      { ...baseJob, id: "j2", quotedHours: 8, timeEntries: [], variations: [] },
    ] as any);
    const res = await GET_SEARCH(makeSearchReq());
    const data = await res.json();
    expect(data.stats.count).toBe(2);
    expect(data.jobs).toHaveLength(2);
  });

  it("stats.avgQuotedHours is the mean of returned jobs' quotedHours", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([
      { ...baseJob, quotedHours: 10, timeEntries: [], variations: [] },
      { ...baseJob, id: "j2", quotedHours: 8, timeEntries: [], variations: [] },
    ] as any);
    const res = await GET_SEARCH(makeSearchReq());
    const data = await res.json();
    expect(data.stats.avgQuotedHours).toBe(9.0);
  });
});
