import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { timeEntry: { findFirst: vi.fn(), update: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { POST } from "../route";

const TECH = { id: "t1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@c.com", isActive: true };
const ENTRY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeReq(body?: unknown) {
  return new Request("http://localhost/api/time/clock-out", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/time/clock-out", () => {
  it("returns 401 for an unauthenticated/unauthorized caller", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await POST(makeReq({ entryId: ENTRY_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid entryId", async () => {
    vi.mocked(requireRole).mockResolvedValue(TECH as any);
    const res = await POST(makeReq({ entryId: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when no active entry exists for this user", async () => {
    vi.mocked(requireRole).mockResolvedValue(TECH as any);
    vi.mocked(db.timeEntry.findFirst).mockResolvedValue(null);
    const res = await POST(makeReq({ entryId: ENTRY_ID }));
    expect(res.status).toBe(404);
    expect(db.timeEntry.update).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the caller's own active entry (can't clock out someone else's)", async () => {
    vi.mocked(requireRole).mockResolvedValue(TECH as any);
    vi.mocked(db.timeEntry.findFirst).mockResolvedValue(null);
    await POST(makeReq({ entryId: ENTRY_ID }));
    expect(db.timeEntry.findFirst).toHaveBeenCalledWith({
      where: { id: ENTRY_ID, userId: "t1", status: "active" },
    });
  });

  it("clocks out an active entry and computes duration", async () => {
    vi.mocked(requireRole).mockResolvedValue(TECH as any);
    const clockInTime = new Date("2026-07-01T08:00:00Z");
    vi.mocked(db.timeEntry.findFirst).mockResolvedValue({ id: ENTRY_ID, clockInTime } as any);
    vi.mocked(db.timeEntry.update).mockResolvedValue({ id: ENTRY_ID, status: "complete" } as any);

    const res = await POST(makeReq({ entryId: ENTRY_ID }));

    expect(res.status).toBe(200);
    expect(db.timeEntry.update).toHaveBeenCalledWith({
      where: { id: ENTRY_ID },
      data: expect.objectContaining({ status: "complete", durationMinutes: expect.any(Number) }),
    });
  });
});
