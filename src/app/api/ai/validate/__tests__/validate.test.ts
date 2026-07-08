import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { findFirst: vi.fn() },
    businessProfile: { findFirst: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { POST } from "../route";

const mockDirector = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };

const validBody = {
  customerName: "Rio Tinto",
  siteName: "Weipa Plant",
  siteAddress: "1 Bauxite Rd, Weipa QLD",
  jobType: "Annual Service",
  quotedHours: 32,
  quotedCost: 7000,
};

function makeReq(body: unknown) {
  return new Request("http://localhost/api/ai/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/ai/validate", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const res = await POST(makeReq({ siteName: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns a rule-layer duplicate flag WITHOUT checking the business profile", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "existing-job" } as any);
    const res = await POST(makeReq(validBody));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.flags).toHaveLength(1);
    expect(data.flags[0].field).toBe("siteName");
    expect(db.businessProfile.findFirst).not.toHaveBeenCalled();
  });

  it("returns no flags for a plausible job when no duplicate is found", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findFirst).mockResolvedValue(null);
    vi.mocked(db.businessProfile.findFirst).mockResolvedValue({ hourlyRate: 220 } as any);

    const res = await POST(makeReq(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.flags).toEqual([]);
  });

  it("flags implausible quotedHours using the rule layer, with no duplicate present", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findFirst).mockResolvedValue(null);
    vi.mocked(db.businessProfile.findFirst).mockResolvedValue({ hourlyRate: null } as any);

    const res = await POST(makeReq({ ...validBody, quotedHours: 400 }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.flags).toHaveLength(1);
    expect(data.flags[0].field).toBe("quotedHours");
  });

  it("flags a quotedCost that deviates from the business's configured hourly rate", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findFirst).mockResolvedValue(null);
    vi.mocked(db.businessProfile.findFirst).mockResolvedValue({ hourlyRate: 145 } as any);

    const res = await POST(makeReq({ ...validBody, quotedHours: 8, quotedCost: 50 }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.flags.some((f: { field: string }) => f.field === "quotedCost")).toBe(true);
  });

  it("returns no flags (not an error) when businessProfile is missing entirely", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findFirst).mockResolvedValue(null);
    vi.mocked(db.businessProfile.findFirst).mockResolvedValue(null);

    const res = await POST(makeReq(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.flags).toEqual([]);
  });
});
