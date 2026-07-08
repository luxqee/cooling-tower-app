import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { asset: { findMany: vi.fn(), create: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET, POST } from "../route";

const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const mockAdmin = { id: "u1", role: "admin" as const, name: "Ana", clerkId: "c1", email: "a@t.com", isActive: true };
const mockDirector = { id: "u2", role: "director" as const, name: "Dana", clerkId: "c2", email: "d@t.com", isActive: true };

function makeGetReq(qs = "") {
  return new Request(`http://localhost/api/assets${qs}`);
}

function makePostReq(body: unknown) {
  return new Request("http://localhost/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/assets", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
  });

  it("returns assets, optionally filtered by customerId", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.asset.findMany).mockResolvedValue([{ id: "a1", serialNumber: "BAC-1" }] as any);
    const res = await GET(makeGetReq(`?customerId=${CUSTOMER_ID}`));
    expect(res.status).toBe(200);
    expect(db.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: CUSTOMER_ID } })
    );
  });
});

describe("POST /api/assets", () => {
  const body = { customerId: CUSTOMER_ID, serialNumber: "BAC-VT1-40", assetType: "Cooling tower" };

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makePostReq(body));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot create assets", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await POST(makePostReq(body));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockAdmin as any);
    const res = await POST(makePostReq({ customerId: CUSTOMER_ID }));
    expect(res.status).toBe(400);
  });

  it("returns 201 and creates the asset for admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockAdmin as any);
    vi.mocked(db.asset.create).mockResolvedValue({ id: "a1", ...body } as any);
    const res = await POST(makePostReq(body));
    expect(res.status).toBe(201);
    expect(db.asset.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining(body) })
    );
  });
});
