import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { invoice: { findMany: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET } from "../route";

const ADMIN = { id: "a1", role: "admin" as const, name: "Admin", clerkId: "ca1", email: "a@c.com", isActive: true };

beforeEach(() => vi.clearAllMocks());

describe("GET /api/export/invoices", () => {
  it("returns 401 for non director/admin roles", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(db.invoice.findMany).not.toHaveBeenCalled();
  });

  it("returns CSV with a header row and one row per invoice for admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.invoice.findMany).mockResolvedValue([
      {
        id: "i1", invoiceNumber: "INV-2026-0001", status: "paid",
        baseAmount: { toString: () => "8000" }, variationsTotal: { toString: () => "900" },
        materialsTotal: { toString: () => "0" }, totalAmount: { toString: () => "8900" },
        sentAt: new Date("2026-06-15T00:00:00Z"), paidAt: new Date("2026-06-20T00:00:00Z"),
        createdAt: new Date("2026-06-01T00:00:00Z"),
        job: { customerName: "Rio Tinto", siteName: "Weipa Plant" },
      },
    ] as any);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("invoices.csv");

    const text = await res.text();
    const lines = text.trim().split("\r\n");
    expect(lines[0]).toBe("Invoice Number,Customer,Site Name,Status,Base Amount,Variations Total,Materials Total,Total Amount,Sent At,Paid At,Created");
    expect(lines[1]).toContain("INV-2026-0001");
    expect(lines[1]).toContain("Rio Tinto");
    expect(lines[1]).toContain("8900");
  });
});
