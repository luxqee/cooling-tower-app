import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { findMany: vi.fn() },
    customer: { findMany: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET } from "../route";

const mockDirector = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };
const mockServiceManager = { id: "u2", role: "service_manager" as const, name: "Sam", clerkId: "c2", email: "s@t.com", isActive: true };

function makeReq(q: string) {
  return new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`);
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/search", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(makeReq("rio"));
    expect(res.status).toBe(401);
  });

  it("returns empty results for a query shorter than 2 characters", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const res = await GET(makeReq("r"));
    const data = await res.json();
    expect(data).toEqual({ jobs: [], customers: [] });
    expect(db.job.findMany).not.toHaveBeenCalled();
  });

  it("searches jobs by customerName, siteName, or jobType", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findMany).mockResolvedValue([{ id: "j1", customerName: "Rio Tinto", siteName: "Weipa", status: "active" }] as any);
    vi.mocked(db.customer.findMany).mockResolvedValue([]);

    const res = await GET(makeReq("rio"));
    const data = await res.json();

    expect(data.jobs).toHaveLength(1);
    const callArg = vi.mocked(db.job.findMany).mock.calls[0][0] as any;
    expect(callArg.where.OR).toEqual([
      { customerName: { contains: "rio", mode: "insensitive" } },
      { siteName: { contains: "rio", mode: "insensitive" } },
      { jobType: { contains: "rio", mode: "insensitive" } },
    ]);
  });

  it("includes customers for a director", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    vi.mocked(db.customer.findMany).mockResolvedValue([{ id: "c1", name: "Rio Tinto", contactPerson: "Jane" }] as any);

    const res = await GET(makeReq("rio"));
    const data = await res.json();

    expect(data.customers).toHaveLength(1);
    expect(db.customer.findMany).toHaveBeenCalled();
  });

  it("excludes customers for a service_manager (no Customers page access)", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockServiceManager as any);
    vi.mocked(db.job.findMany).mockResolvedValue([]);

    const res = await GET(makeReq("rio"));
    const data = await res.json();

    expect(data.customers).toEqual([]);
    expect(db.customer.findMany).not.toHaveBeenCalled();
  });
});
