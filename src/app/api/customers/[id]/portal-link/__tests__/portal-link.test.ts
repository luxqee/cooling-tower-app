import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { customer: { findUnique: vi.fn() }, customerPortalToken: { create: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { POST } from "../route";

const CUSTOMER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const mockDirector = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };
const mockTechnician = { id: "u2", role: "technician" as const, name: "Jake", clerkId: "c2", email: "j@t.com", isActive: true };

function makeCtx() {
  return { params: { id: CUSTOMER_ID } };
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/customers/[id]/portal-link", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(new Request("http://localhost/x"), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns 401 for a technician (not admin/director/sales_engineer)", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await POST(new Request("http://localhost/x"), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns 404 when the customer does not exist", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/x"), makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns 201 with a token that is at least 32 characters and an expiry in the future", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue({ id: CUSTOMER_ID } as any);
    vi.mocked(db.customerPortalToken.create).mockImplementation((async ({ data }: any) => ({
      id: "pt1", ...data,
    })) as any);
    const res = await POST(new Request("http://localhost/x"), makeCtx());
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.token.length).toBeGreaterThanOrEqual(32);
    expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(db.customerPortalToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ customerId: CUSTOMER_ID }) })
    );
  });

  it("generates a different token on each call", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue({ id: CUSTOMER_ID } as any);
    vi.mocked(db.customerPortalToken.create).mockImplementation((async ({ data }: any) => ({ id: "pt1", ...data })) as any);
    const res1 = await POST(new Request("http://localhost/x"), makeCtx());
    const res2 = await POST(new Request("http://localhost/x"), makeCtx());
    const [d1, d2] = await Promise.all([res1.json(), res2.json()]);
    expect(d1.token).not.toBe(d2.token);
  });
});
