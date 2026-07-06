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
