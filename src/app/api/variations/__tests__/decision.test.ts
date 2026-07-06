import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/push/vapid", () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db/client", () => ({
  db: {
    $transaction: vi.fn(),
    variation:    { findUnique: vi.fn(), update: vi.fn() },
    invoice:      { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    user:         { findUnique: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { PATCH } from "../[id]/decision/route";

const VAR_ID  = "55555555-5555-4555-8555-555555555555";
const mockDirector = { id: "d1", role: "director" as const, name: "Boss", clerkId: "c1", email: "b@c.com", isActive: true };
const pendingVar   = { id: VAR_ID, jobId: "j1", technicianId: "t1", costEstimate: 450, status: "pending", decidedAt: null };

function makeReq(body: unknown) {
  return new Request(`http://localhost/api/variations/${VAR_ID}/decision`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/variations/[id]/decision", () => {
  it("returns 401 for non-director", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await PATCH(makeReq({ decision: "approved" }), { params: { id: VAR_ID } });
    expect(res.status).toBe(401);
  });

  it("returns 404 when variation not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.variation.findUnique).mockResolvedValue(null);
    const res = await PATCH(makeReq({ decision: "approved" }), { params: { id: VAR_ID } });
    expect(res.status).toBe(404);
  });

  it("returns 409 when variation already decided — status check is inside the transaction so concurrent approvals are blocked", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    // Simulate the transaction failing with P2025 because the row no longer matches { status: 'pending' }
    vi.mocked(db.$transaction).mockRejectedValue(
      Object.assign(new Error("Not found"), { code: "P2025" })
    );
    const alreadyDecidedVar = { ...pendingVar, status: "approved" };
    vi.mocked(db.variation.findUnique).mockResolvedValue(alreadyDecidedVar as any);
    const res = await PATCH(makeReq({ decision: "approved" }), { params: { id: VAR_ID } });
    expect(res.status).toBe(409);
  });
});
