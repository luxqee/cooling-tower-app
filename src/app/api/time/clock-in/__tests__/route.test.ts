import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    timeEntry: { findFirst: vi.fn(), create: vi.fn() },
    assignment: { findFirst: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { POST } from "../route";

const TECH = { id: "t1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@c.com", isActive: true };
const DIRECTOR = { id: "d1", role: "director" as const, name: "Boss", clerkId: "c2", email: "d@c.com", isActive: true };
const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function makeReq(body?: unknown) {
  return new Request("http://localhost/api/time/clock-in", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/time/clock-in", () => {
  it("returns 401 for an unauthenticated/unauthorized caller", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await POST(makeReq({ jobId: JOB_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid jobId", async () => {
    vi.mocked(requireRole).mockResolvedValue(TECH as any);
    const res = await POST(makeReq({ jobId: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when already clocked in to another job", async () => {
    vi.mocked(requireRole).mockResolvedValue(TECH as any);
    vi.mocked(db.timeEntry.findFirst).mockResolvedValue({ id: "active-entry" } as any);
    const res = await POST(makeReq({ jobId: JOB_ID }));
    expect(res.status).toBe(409);
    expect(db.timeEntry.create).not.toHaveBeenCalled();
  });

  it("returns 403 when a technician is not assigned to the job", async () => {
    vi.mocked(requireRole).mockResolvedValue(TECH as any);
    vi.mocked(db.timeEntry.findFirst).mockResolvedValue(null);
    vi.mocked(db.assignment.findFirst).mockResolvedValue(null);
    const res = await POST(makeReq({ jobId: JOB_ID }));
    expect(res.status).toBe(403);
    expect(db.timeEntry.create).not.toHaveBeenCalled();
  });

  it("clocks in a technician assigned to the job", async () => {
    vi.mocked(requireRole).mockResolvedValue(TECH as any);
    vi.mocked(db.timeEntry.findFirst).mockResolvedValue(null);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);
    vi.mocked(db.timeEntry.create).mockResolvedValue({ id: "te1" } as any);

    const res = await POST(makeReq({ jobId: JOB_ID }));

    expect(res.status).toBe(201);
    expect(db.assignment.findFirst).toHaveBeenCalledWith({ where: { userId: "t1", jobId: JOB_ID } });
    expect(db.timeEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "t1", jobId: JOB_ID, status: "active" }),
    });
  });

  it("lets a director clock in without an assignment check", async () => {
    vi.mocked(requireRole).mockResolvedValue(DIRECTOR as any);
    vi.mocked(db.timeEntry.findFirst).mockResolvedValue(null);
    vi.mocked(db.timeEntry.create).mockResolvedValue({ id: "te2" } as any);

    const res = await POST(makeReq({ jobId: JOB_ID }));

    expect(res.status).toBe(201);
    expect(db.assignment.findFirst).not.toHaveBeenCalled();
  });
});
