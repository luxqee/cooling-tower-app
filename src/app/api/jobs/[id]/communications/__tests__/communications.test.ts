import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/communications/validate", () => ({
  validateCommunicationInput: vi.fn((b) => {
    if (!b.type || !b.body || typeof b.body !== "string" || !b.body.trim()) {
      return { success: false, error: { issues: [{ message: "invalid" }] } };
    }
    return { success: true, data: b };
  }),
}));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { findUnique: vi.fn() },
    assignment: { findFirst: vi.fn() },
    jobCommunication: { create: vi.fn(), findMany: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET, POST } from "../route";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const mockDirector = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };
const mockTechnician = { id: "u2", role: "technician" as const, name: "Jake", clerkId: "c2", email: "j@t.com", isActive: true };
const mockJob = { id: JOB_ID };

function makeCtx() {
  return { params: { id: JOB_ID } };
}

function makeGetReq() {
  return new Request(`http://localhost/api/jobs/${JOB_ID}/communications`);
}

function makePostReq(body: unknown) {
  return new Request(`http://localhost/api/jobs/${JOB_ID}/communications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/jobs/[id]/communications", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(makeGetReq(), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns full log for a director", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.jobCommunication.findMany).mockResolvedValue([
      { id: "jc1", type: "client_call", body: "Called re: pump" },
      { id: "jc2", type: "field_instruction", body: "Check the valve" },
    ] as any);
    const res = await GET(makeGetReq(), makeCtx());
    expect(res.status).toBe(200);
    expect(db.jobCommunication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jobId: JOB_ID } })
    );
  });

  it("returns 403 for a technician not assigned to the job", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue(null);
    const res = await GET(makeGetReq(), makeCtx());
    expect(res.status).toBe(403);
  });

  it("filters to field_instruction only for an assigned technician", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);
    vi.mocked(db.jobCommunication.findMany).mockResolvedValue([
      { id: "jc2", type: "field_instruction", body: "Check the valve" },
    ] as any);
    const res = await GET(makeGetReq(), makeCtx());
    expect(res.status).toBe(200);
    expect(db.jobCommunication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jobId: JOB_ID, type: "field_instruction" } })
    );
  });
});

describe("POST /api/jobs/[id]/communications", () => {
  const body = { type: "internal_note", body: "Customer requested Friday visit" };

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makePostReq(body), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const res = await POST(makePostReq({ type: "internal_note", body: "" }), makeCtx());
    expect(res.status).toBe(400);
  });

  it("returns 404 when the job does not exist", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findUnique).mockResolvedValue(null);
    const res = await POST(makePostReq(body), makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns 201 and creates the entry for a director", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findUnique).mockResolvedValue(mockJob as any);
    vi.mocked(db.jobCommunication.create).mockResolvedValue({
      id: "jc1",
      jobId: JOB_ID,
      authorId: mockDirector.id,
      ...body,
      createdAt: new Date(),
    } as any);
    const res = await POST(makePostReq(body), makeCtx());
    expect(res.status).toBe(201);
    expect(db.jobCommunication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobId: JOB_ID, authorId: mockDirector.id, type: "internal_note" }),
      })
    );
  });
});
