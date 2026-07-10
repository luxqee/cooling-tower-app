import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { quote: { findMany: vi.fn(), create: vi.fn() }, customer: { findUnique: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET, POST } from "../route";

const mockSalesEngineer = { id: "u1", role: "sales_engineer" as const, name: "Sam", clerkId: "c1", email: "s@t.com", isActive: true };
const mockTechnician = { id: "u2", role: "technician" as const, name: "Jake", clerkId: "c2", email: "j@t.com", isActive: true };

function makePostReq(body: unknown) {
  return new Request("http://localhost/api/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/quotes", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 with the quote list", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.quote.findMany).mockResolvedValue([
      { id: "q1", customerName: "Rio Tinto", totalAmount: { toNumber: () => 1200 } },
    ] as any);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("POST /api/quotes", () => {
  const body = {
    customerName: "Rio Tinto",
    siteName: "Weipa",
    jobType: "Annual service",
    lineItems: [{ description: "Labour", qty: 8, unitPrice: 95 }],
  };

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makePostReq(body));
    expect(res.status).toBe(401);
  });

  it("returns 401 for a technician (not sales_engineer/director/admin)", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await POST(makePostReq(body));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    const res = await POST(makePostReq({ customerName: "Rio Tinto" }));
    expect(res.status).toBe(400);
  });

  it("returns 201, computes the total from line items, and defaults status to draft", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.quote.create).mockResolvedValue({
      id: "q1", ...body, totalAmount: { toNumber: () => 760 }, status: "draft", createdAt: new Date(),
    } as any);
    const res = await POST(makePostReq(body));
    expect(res.status).toBe(201);
    expect(db.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customerName: "Rio Tinto", customerId: null, totalAmount: 760, status: "draft" }),
      })
    );
  });

  it("returns 404 when customerId doesn't match a real customer", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue(null);

    const res = await POST(makePostReq({ ...body, customerId: "11111111-1111-4111-8111-111111111111", customerName: undefined }));

    expect(res.status).toBe(404);
    expect(db.quote.create).not.toHaveBeenCalled();
  });

  it("resolves customerId to a real customer and snapshots its name, when no customerName is given", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue({ id: "c1", name: "Rio Tinto Pty Ltd" } as any);
    vi.mocked(db.quote.create).mockResolvedValue({
      id: "q1", customerName: "Rio Tinto Pty Ltd", totalAmount: { toNumber: () => 760 }, status: "draft", createdAt: new Date(),
    } as any);

    const { customerName: _unused, ...rest } = body;
    const res = await POST(makePostReq({ ...rest, customerId: "11111111-1111-4111-8111-111111111111" }));

    expect(res.status).toBe(201);
    expect(db.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customerId: "11111111-1111-4111-8111-111111111111", customerName: "Rio Tinto Pty Ltd" }),
      })
    );
  });

  it("returns 400 when neither customerName nor customerId is given", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    const { customerName: _unused, ...rest } = body;

    const res = await POST(makePostReq(rest));

    expect(res.status).toBe(400);
  });
});
