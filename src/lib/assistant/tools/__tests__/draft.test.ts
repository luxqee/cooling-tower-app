import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {
    user: { findFirst: vi.fn() },
    assignment: { findFirst: vi.fn() },
    variation: { create: vi.fn() },
    quote: { create: vi.fn() },
  },
}));
vi.mock("@/lib/jobs/queries", () => ({ getActiveJobById: vi.fn() }));

import { db } from "@/lib/db/client";
import { getActiveJobById } from "@/lib/jobs/queries";
import { draftVariation, draftQuote } from "../draft";

const director = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };
const salesEngineer = { id: "u2", role: "sales_engineer" as const, name: "Sam", clerkId: "c2", email: "s@t.com", isActive: true };

beforeEach(() => vi.clearAllMocks());

describe("draftVariation", () => {
  it("returns an error when the calling user's role isn't allowed to draft variations", async () => {
    const result = await draftVariation(
      { jobId: "job1", technicianName: "Jake", description: "Fan belt", costEstimate: 50 },
      salesEngineer as any
    );
    expect(result.ok).toBe(false);
    expect(db.variation.create).not.toHaveBeenCalled();
  });

  it("returns an error when the named technician can't be found", async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue(null);
    const result = await draftVariation(
      { jobId: "job1", technicianName: "Nobody", description: "Fan belt", costEstimate: 50 },
      director as any
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Nobody");
  });

  it("creates a pending Variation attributed to the resolved technician, not the calling director", async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue({ id: "tech1", name: "Jake Morrison", role: "technician" } as any);
    vi.mocked(getActiveJobById).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);
    vi.mocked(db.variation.create).mockResolvedValue({ id: "var1" } as any);

    const result = await draftVariation(
      { jobId: "job1", technicianName: "Jake Morrison", description: "Fan belt for $50", costEstimate: 50 },
      director as any
    );

    expect(result).toEqual({ ok: true, variationId: "var1" });
    expect(db.variation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ technicianId: "tech1", jobId: "job1", status: "pending", costEstimate: 50 }),
      })
    );
  });

  it("returns an error when the resolved technician isn't assigned to the job", async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue({ id: "tech1", name: "Jake Morrison", role: "technician" } as any);
    vi.mocked(getActiveJobById).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue(null);

    const result = await draftVariation(
      { jobId: "job1", technicianName: "Jake Morrison", description: "Fan belt", costEstimate: 50 },
      director as any
    );

    expect(result.ok).toBe(false);
    expect(db.variation.create).not.toHaveBeenCalled();
  });
});

describe("draftQuote", () => {
  it("returns an error when the calling user's role isn't allowed to draft quotes", async () => {
    const technician = { id: "u3", role: "technician" as const, name: "Jake", clerkId: "c3", email: "j@t.com", isActive: true };
    const result = await draftQuote(
      { customerName: "Rio Tinto", siteName: "Weipa", jobType: "Inspection", lineItems: [{ description: "Labour", qty: 2, unitPrice: 100 }] },
      technician as any
    );
    expect(result.ok).toBe(false);
    expect(db.quote.create).not.toHaveBeenCalled();
  });

  it("creates a draft Quote attributed to the calling user", async () => {
    vi.mocked(db.quote.create).mockResolvedValue({ id: "q1" } as any);

    const result = await draftQuote(
      { customerName: "Rio Tinto", siteName: "Weipa", jobType: "Inspection", lineItems: [{ description: "Labour", qty: 2, unitPrice: 100 }] },
      director as any
    );

    expect(result).toEqual({ ok: true, quoteId: "q1" });
    expect(db.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdById: "u1", status: "draft", totalAmount: 200 }),
      })
    );
  });
});
