import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { customer: { findMany: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET } from "../route";

const ADMIN = { id: "a1", role: "admin" as const, name: "Admin", clerkId: "ca1", email: "a@c.com", isActive: true };

beforeEach(() => vi.clearAllMocks());

describe("GET /api/export/customers", () => {
  it("returns 401 for non director/admin roles", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(db.customer.findMany).not.toHaveBeenCalled();
  });

  it("returns CSV with a header row and one row per customer for admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.customer.findMany).mockResolvedValue([
      {
        id: "c1", name: "Rio Tinto", abn: "33 007 457 141", contactPerson: "Jane Smith",
        email: "jane@riotinto.com", phone: "0400 000 000", address: "123 Mine Rd",
        notes: null, createdAt: new Date("2026-07-01T00:00:00Z"), updatedAt: new Date("2026-07-01T00:00:00Z"),
      },
    ] as any);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("customers.csv");

    const text = await res.text();
    const lines = text.trim().split("\r\n");
    expect(lines[0]).toBe("Name,ABN,Contact Person,Email,Phone,Address,Notes,Created");
    expect(lines[1]).toContain("Rio Tinto");
    expect(lines[1]).toContain("jane@riotinto.com");
  });

  it("allows director role", async () => {
    vi.mocked(requireRole).mockResolvedValue({ ...ADMIN, role: "director" } as any);
    vi.mocked(db.customer.findMany).mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
