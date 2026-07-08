import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { findUnique: vi.fn() },
    materialEntry: { create: vi.fn(), findMany: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET, POST } from "../route";

const JOB_ID = "55555555-5555-4555-8555-555555555555";
const mockTechnician = { id: "u1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };
const mockJob = { id: JOB_ID };

function makeCtx() {
  return { params: { id: JOB_ID } };
}

function makePostReq(body: unknown) {
  return new Request(`http://localhost/api/jobs/${JOB_ID}/materials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/jobs/[id]/materials", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(new Request("http://localhost/x"), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns the material entries for a job", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.materialEntry.findMany).mockResolvedValue([
      { id: "m1", description: "Pump seal", estimatedCost: { toNumber: () => 120 } },
    ] as any);
    const res = await GET(new Request("http://localhost/x"), makeCtx());
    expect(res.status).toBe(200);
    expect(db.materialEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { jobId: JOB_ID } }));
  });
});

describe("POST /api/jobs/[id]/materials", () => {
  const body = { description: "Pump seal", estimatedCost: 120 };

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makePostReq(body), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    const res = await POST(makePostReq({ description: "" }), makeCtx());
    expect(res.status).toBe(400);
  });

  it("returns 404 when the job does not exist", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.job.findUnique).mockResolvedValue(null);
    const res = await POST(makePostReq(body), makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns 201 and creates the entry, defaulting status to pending", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.job.findUnique).mockResolvedValue(mockJob as any);
    vi.mocked(db.materialEntry.create).mockResolvedValue({
      id: "m1", jobId: JOB_ID, createdById: mockTechnician.id, description: body.description,
      estimatedCost: { toNumber: () => body.estimatedCost }, status: "pending",
    } as any);
    const res = await POST(makePostReq(body), makeCtx());
    expect(res.status).toBe(201);
    expect(db.materialEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobId: JOB_ID, createdById: mockTechnician.id, description: "Pump seal" }),
      })
    );
  });
});
