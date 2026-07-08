import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    $transaction: vi.fn(),
    customer: {
      findMany:   vi.fn(),
      findUnique: vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      delete:     vi.fn(),
    },
    job: { updateMany: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET as GET_LIST, POST } from "../route";
import { GET as GET_DETAIL, PATCH, DELETE } from "../[id]/route";

const ADMIN    = { id: "a1", role: "admin"      as const, name: "Admin", clerkId: "ca1", email: "a@c.com", isActive: true };
const DIRECTOR = { id: "d1", role: "director"   as const, name: "Boss",  clerkId: "cd1", email: "d@c.com", isActive: true };

const CUST_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const baseCustomer = {
  id:            CUST_ID,
  name:          "Rio Tinto",
  abn:           "33 007 457 141",
  contactPerson: "Jane Smith",
  email:         "jane@riotinto.com",
  phone:         "0400 000 000",
  address:       "123 Mine Rd, Brisbane QLD 4000",
  notes:         null,
  createdAt:     new Date("2026-07-01T00:00:00Z"),
  updatedAt:     new Date("2026-07-01T00:00:00Z"),
};

function makeReq(url: string, init?: RequestInit) {
  return new Request(`http://localhost${url}`, init);
}

beforeEach(() => vi.clearAllMocks());

// ── GET /api/customers ────────────────────────────────────────────────────────

describe("GET /api/customers", () => {
  it("returns 401 for technician", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET_LIST(makeReq("/api/customers"));
    expect(res.status).toBe(401);
  });

  it("returns customer list for admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.customer.findMany).mockResolvedValue([
      { id: CUST_ID, name: "Rio Tinto", email: null, phone: null, abn: null },
    ] as any);
    const res = await GET_LIST(makeReq("/api/customers"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("Rio Tinto");
  });

  it("passes ?q filter to Prisma with contains insensitive", async () => {
    vi.mocked(requireRole).mockResolvedValue(DIRECTOR as any);
    vi.mocked(db.customer.findMany).mockResolvedValue([
      { id: CUST_ID, name: "Rio Tinto", email: null, phone: null, abn: null },
    ] as any);
    await GET_LIST(makeReq("/api/customers?q=rio"));
    expect(vi.mocked(db.customer.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: "rio", mode: "insensitive" } },
      })
    );
  });
});

// ── POST /api/customers ───────────────────────────────────────────────────────

describe("POST /api/customers", () => {
  it("returns 401 for non-admin", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await POST(makeReq("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ACME" }),
    }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    const res = await POST(makeReq("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is too short (< 2 chars)", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    const res = await POST(makeReq("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "A" }),
    }));
    expect(res.status).toBe(400);
  });

  it("creates customer and returns 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.customer.create).mockResolvedValue(baseCustomer as any);
    const res = await POST(makeReq("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Rio Tinto" }),
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Rio Tinto");
    expect(data.id).toBe(CUST_ID);
  });
});

// ── GET /api/customers/[id] ───────────────────────────────────────────────────

describe("GET /api/customers/[id]", () => {
  it("returns 401 for technician", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET_DETAIL(makeReq(`/api/customers/${CUST_ID}`), { params: { id: CUST_ID } });
    expect(res.status).toBe(401);
  });

  it("returns 404 when customer does not exist", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue(null);
    const res = await GET_DETAIL(makeReq(`/api/customers/${CUST_ID}`), { params: { id: CUST_ID } });
    expect(res.status).toBe(404);
  });

  it("returns customer with linked jobs and ISO date strings", async () => {
    vi.mocked(requireRole).mockResolvedValue(DIRECTOR as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue({
      ...baseCustomer,
      jobs: [{
        id: "j1", customerName: "Rio Tinto", siteName: "Weipa",
        status: "active", createdAt: new Date("2026-07-01T00:00:00Z"), jobType: "Annual Service",
      }],
    } as any);
    const res = await GET_DETAIL(makeReq(`/api/customers/${CUST_ID}`), { params: { id: CUST_ID } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jobs).toHaveLength(1);
    expect(data.jobs[0].siteName).toBe("Weipa");
    expect(typeof data.createdAt).toBe("string");
    expect(typeof data.jobs[0].createdAt).toBe("string");
  });
});

// ── PATCH /api/customers/[id] ─────────────────────────────────────────────────

describe("PATCH /api/customers/[id]", () => {
  it("returns 401 for non-admin", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await PATCH(makeReq(`/api/customers/${CUST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Rio Tinto Ltd" }),
    }), { params: { id: CUST_ID } });
    expect(res.status).toBe(401);
  });

  it("syncs customerName on linked jobs when name is updated", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue(baseCustomer as any);
    const updatedCustomer = { ...baseCustomer, name: "Rio Tinto Ltd" };
    let capturedJobUpdate: any = null;
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        customer: { update: vi.fn().mockResolvedValue(updatedCustomer) },
        job: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            capturedJobUpdate = args;
            return { count: 1 };
          }),
        },
      })
    );
    const res = await PATCH(makeReq(`/api/customers/${CUST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Rio Tinto Ltd" }),
    }), { params: { id: CUST_ID } });
    expect(res.status).toBe(200);
    expect(capturedJobUpdate?.data?.customerName).toBe("Rio Tinto Ltd");
    expect(capturedJobUpdate?.where?.customerId).toBe(CUST_ID);
  });

  it("does not call job.updateMany when name is not in the patch body", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue(baseCustomer as any);
    const jobUpdateManySpy = vi.fn();
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        customer: { update: vi.fn().mockResolvedValue(baseCustomer) },
        job: { updateMany: jobUpdateManySpy },
      })
    );
    await PATCH(makeReq(`/api/customers/${CUST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "0411 000 000" }),
    }), { params: { id: CUST_ID } });
    expect(jobUpdateManySpy).not.toHaveBeenCalled();
  });
});

// ── DELETE /api/customers/[id] ────────────────────────────────────────────────

describe("DELETE /api/customers/[id]", () => {
  it("returns 401 for non-admin", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await DELETE(makeReq(`/api/customers/${CUST_ID}`, { method: "DELETE" }), { params: { id: CUST_ID } });
    expect(res.status).toBe(401);
  });

  it("returns 404 when customer does not exist", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue(null);
    const res = await DELETE(makeReq(`/api/customers/${CUST_ID}`, { method: "DELETE" }), { params: { id: CUST_ID } });
    expect(res.status).toBe(404);
  });

  it("nullifies customerId on linked jobs then deletes customer, returns 204", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue(baseCustomer as any);
    let capturedJobUpdate: any = null;
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({
        job: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            capturedJobUpdate = args;
            return { count: 1 };
          }),
        },
        customer: { delete: vi.fn().mockResolvedValue(baseCustomer) },
      })
    );
    const res = await DELETE(makeReq(`/api/customers/${CUST_ID}`, { method: "DELETE" }), { params: { id: CUST_ID } });
    expect(res.status).toBe(204);
    expect(capturedJobUpdate?.data?.customerId).toBeNull();
    expect(capturedJobUpdate?.where?.customerId).toBe(CUST_ID);
  });
});
