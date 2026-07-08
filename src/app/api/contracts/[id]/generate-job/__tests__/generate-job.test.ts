import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { contract: { findUnique: vi.fn() }, job: { create: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { POST } from "../route";

const CONTRACT_ID = "99999999-9999-4999-8999-999999999999";
const mockDirector = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };
const mockContract = {
  id: CONTRACT_ID,
  customerId: "c1",
  siteName: "Weipa Plant",
  status: "active",
  customer: { name: "Rio Tinto", address: "1 Mine Rd, Weipa QLD" },
};

function makeCtx() {
  return { params: { id: CONTRACT_ID } };
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/contracts/[id]/generate-job", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(new Request("http://localhost/x"), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns 404 when the contract does not exist", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.contract.findUnique).mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/x"), makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns 409 when the contract is not active", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.contract.findUnique).mockResolvedValue({ ...mockContract, status: "lapsed" } as any);
    const res = await POST(new Request("http://localhost/x"), makeCtx());
    expect(res.status).toBe(409);
  });

  it("returns 201 and creates a job pre-filled from the contract", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.contract.findUnique).mockResolvedValue(mockContract as any);
    vi.mocked(db.job.create).mockResolvedValue({ id: "j1", contractId: CONTRACT_ID } as any);
    const res = await POST(new Request("http://localhost/x"), makeCtx());
    expect(res.status).toBe(201);
    expect(db.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contractId: CONTRACT_ID,
          customerId: "c1",
          customerName: "Rio Tinto",
          siteName: "Weipa Plant",
          siteAddress: "1 Mine Rd, Weipa QLD",
          status: "scheduled",
        }),
      })
    );
  });
});
