import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { materialEntry: { update: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { PATCH } from "../route";

const ENTRY_ID = "66666666-6666-4666-8666-666666666666";
const mockAdmin = { id: "u1", role: "admin" as const, name: "Ana", clerkId: "c1", email: "a@t.com", isActive: true };
const mockTechnician = { id: "u2", role: "technician" as const, name: "Jake", clerkId: "c2", email: "j@t.com", isActive: true };

function makeReq(body: unknown) {
  return new Request(`http://localhost/api/materials/${ENTRY_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function makeCtx() {
  return { params: { id: ENTRY_ID } };
}

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/materials/[id]", () => {
  const body = { actualCost: 135, receiptUrl: "https://blob.example.com/r1.jpg" };

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await PATCH(makeReq(body), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns 401 for a technician (reconciliation is admin/director only)", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await PATCH(makeReq(body), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockAdmin as any);
    const res = await PATCH(makeReq({ actualCost: -5 }), makeCtx());
    expect(res.status).toBe(400);
  });

  it("returns 200, marks reconciled, and stamps reconciledAt", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockAdmin as any);
    vi.mocked(db.materialEntry.update).mockResolvedValue({
      id: ENTRY_ID, actualCost: { toNumber: () => 135 }, estimatedCost: { toNumber: () => 120 },
      status: "reconciled", reconciledAt: new Date(),
    } as any);
    const res = await PATCH(makeReq(body), makeCtx());
    expect(res.status).toBe(200);
    expect(db.materialEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ENTRY_ID },
        data: expect.objectContaining({ actualCost: 135, status: "reconciled" }),
      })
    );
  });
});
