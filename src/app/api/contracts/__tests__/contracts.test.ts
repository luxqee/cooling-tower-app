import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { contract: { findMany: vi.fn(), create: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET, POST } from "../route";

const CUSTOMER_ID = "88888888-8888-4888-8888-888888888888";
const mockDirector = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };

function makePostReq(body: unknown) {
  return new Request("http://localhost/api/contracts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/contracts", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 with the contract list", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.contract.findMany).mockResolvedValue([
      { id: "ct1", siteName: "Weipa", value: { toNumber: () => 4800 } },
    ] as any);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("POST /api/contracts", () => {
  const body = {
    customerId: CUSTOMER_ID,
    siteName: "Weipa Plant",
    value: 4800,
    billingCadence: "quarterly",
    serviceIntervalDays: 90,
    startDate: "2026-07-01T00:00:00.000Z",
  };

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makePostReq(body));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const res = await POST(makePostReq({ customerId: CUSTOMER_ID }));
    expect(res.status).toBe(400);
  });

  it("returns 201 and computes renewalDate from startDate + cadence", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.contract.create).mockResolvedValue({
      id: "ct1", ...body, value: { toNumber: () => 4800 }, status: "active",
      renewalDate: new Date("2026-10-01T00:00:00.000Z"),
    } as any);
    const res = await POST(makePostReq(body));
    expect(res.status).toBe(201);
    expect(db.contract.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          siteName: "Weipa Plant",
          renewalDate: new Date("2026-10-01T00:00:00.000Z"),
          status: "active",
        }),
      })
    );
  });
});
