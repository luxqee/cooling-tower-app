import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk",          () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/push/vapid",          () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/variations/validate", () => ({
  validateVariationInput: vi.fn((b) => {
    if (!b.jobId || !b.description || !b.costEstimate) {
      return { success: false, error: { issues: [{ message: "invalid" }] } };
    }
    return { success: true, data: b };
  }),
}));
vi.mock("@/lib/db/client", () => ({
  db: {
    job:        { findFirst: vi.fn() },
    assignment: { findFirst: vi.fn() },
    variation:  { create: vi.fn(), findMany: vi.fn() },
    user:       { findMany: vi.fn() },
    notification: { createMany: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET, POST } from "../route";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const mockUser = { id: "u1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };
const mockJob  = { id: JOB_ID, customerName: "Rio Tinto", siteName: "Weipa", status: "active" };

function makeReq(body: unknown) {
  return new Request("http://localhost/api/variations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/variations", () => {
  it("returns 401 for technician (not director/admin)", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("POST /api/variations", () => {
  const body = { jobId: JOB_ID, description: "Pump failed", costEstimate: 450, photoUrl: null };

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq(body));
    expect(res.status).toBe(401);
  });

  it("returns 403 when technician is not assigned to the job", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.job.findFirst).mockResolvedValue(mockJob as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue(null); // not assigned
    const res = await POST(makeReq(body));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/not assigned/i);
  });

  it("returns 404 when job does not exist", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.job.findFirst).mockResolvedValue(null);
    const res = await POST(makeReq(body));
    expect(res.status).toBe(404);
  });

  it("returns 201 when technician is assigned to the job", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.job.findFirst).mockResolvedValue(mockJob as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);
    vi.mocked(db.variation.create).mockResolvedValue({
      id: "v1", ...body, costEstimate: { toNumber: () => 450 }, status: "pending", submittedAt: new Date(),
      job: { customerName: "Rio Tinto", siteName: "Weipa" },
    } as any);
    vi.mocked(db.user.findMany).mockResolvedValue([]);
    const res = await POST(makeReq(body));
    expect(res.status).toBe(201);
  });
});
