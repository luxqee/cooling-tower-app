import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { job: { findMany: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET } from "../route";

const ADMIN = { id: "a1", role: "admin" as const, name: "Admin", clerkId: "ca1", email: "a@c.com", isActive: true };

beforeEach(() => vi.clearAllMocks());

describe("GET /api/export/jobs", () => {
  it("returns 401 for non director/admin roles", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(db.job.findMany).not.toHaveBeenCalled();
  });

  it("returns CSV with a header row and one row per job for admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.job.findMany).mockResolvedValue([
      {
        id: "j1", customerName: "Rio Tinto", siteName: "Weipa Plant", siteAddress: "1 Mine Rd",
        status: "complete", jobType: "Annual Service", quotedHours: 40, quotedCost: 8900,
        createdAt: new Date("2026-06-01T00:00:00Z"),
      },
    ] as any);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("jobs.csv");

    const text = await res.text();
    const lines = text.trim().split("\r\n");
    expect(lines[0]).toBe("Customer,Site Name,Site Address,Job Type,Status,Quoted Hours,Quoted Cost,Created");
    expect(lines[1]).toContain("Rio Tinto");
    expect(lines[1]).toContain("Weipa Plant");
  });
});
