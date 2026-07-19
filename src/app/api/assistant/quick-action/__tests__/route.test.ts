// src/app/api/assistant/quick-action/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/jobs/queries", () => ({ getActiveJobs: vi.fn() }));
vi.mock("@/lib/assistant/tools/read", () => ({ findJobs: vi.fn(), findAssignments: vi.fn() }));
vi.mock("@/lib/variations/queries", () => ({ getPendingVariations: vi.fn() }));
vi.mock("@/lib/invoicing/queries", () => ({ getUnpaidInvoices: vi.fn() }));

import { requireRole } from "@/lib/auth/clerk";
import { getActiveJobs } from "@/lib/jobs/queries";
import { findJobs, findAssignments } from "@/lib/assistant/tools/read";
import { getPendingVariations } from "@/lib/variations/queries";
import { getUnpaidInvoices } from "@/lib/invoicing/queries";
import { POST } from "../route";

const mockDirector = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };

function makeReq(body: unknown) {
  return new Request("http://localhost/api/assistant/quick-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/assistant/quick-action", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq({ action: "activeJobs" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an unknown action", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const res = await POST(makeReq({ action: "bogus" }));
    expect(res.status).toBe(400);
  });

  it("formats the active jobs list without calling Claude", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(getActiveJobs).mockResolvedValue([
      { id: "j1", customerName: "Glencore", siteName: "Mt Isa", siteAddress: "22 Marian St", status: "active" },
    ] as any);
    const res = await POST(makeReq({ action: "activeJobs" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reply).toContain("Glencore");
    expect(data.reply).toContain("Mt Isa");
    expect(data.reply).toContain("(/jobs/j1)");
  });

  it("returns a fallback message when there are no active jobs", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(getActiveJobs).mockResolvedValue([]);
    const res = await POST(makeReq({ action: "activeJobs" }));
    const data = await res.json();
    expect(data.reply).toBe("No active or scheduled jobs.");
  });

  it("formats this week's assignments using a computed date range", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(findAssignments).mockResolvedValue([
      { technicianName: "Jake Morrison", jobId: "j1", customerName: "Glencore", siteName: "Mt Isa", assignedDate: "2026-07-14T00:00:00.000Z" },
    ] as any);
    const res = await POST(makeReq({ action: "weekAssignments" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reply).toContain("Jake Morrison");
    expect(data.reply).toContain("(/jobs/j1)");
    expect(findAssignments).toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: expect.any(String), dateTo: expect.any(String) })
    );
  });

  it("returns a fallback message when there are no assignments this week", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(findAssignments).mockResolvedValue([]);
    const res = await POST(makeReq({ action: "weekAssignments" }));
    const data = await res.json();
    expect(data.reply).toBe("No assignments this week.");
  });

  it("formats overdue jobs without calling Claude", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(findJobs).mockResolvedValue([
      { id: "j1", customerName: "Glencore", siteName: "Mt Isa", status: "active", quotedHours: 40, jobType: "Annual Service" },
    ] as any);
    const res = await POST(makeReq({ action: "overdueJobs" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reply).toContain("Glencore");
    expect(data.reply).toContain("(/jobs/j1)");
    expect(findJobs).toHaveBeenCalledWith({ overdueOnly: true });
  });

  it("returns a fallback message when no jobs are overdue", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(findJobs).mockResolvedValue([]);
    const res = await POST(makeReq({ action: "overdueJobs" }));
    const data = await res.json();
    expect(data.reply).toBe("No jobs currently over their quoted hours.");
  });

  it("formats pending variations without calling Claude", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(getPendingVariations).mockResolvedValue([
      {
        description: "Replace fan belt", costEstimate: { toNumber: () => 320 },
        technician: { name: "Jake Morrison" }, job: { id: "j1", customerName: "Glencore", siteName: "Mt Isa" },
      },
    ] as any);
    const res = await POST(makeReq({ action: "pendingVariations" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reply).toContain("Glencore");
    expect(data.reply).toContain("Jake Morrison");
    expect(data.reply).toContain("320");
    expect(data.reply).toContain("(/jobs/j1)");
  });

  it("returns a fallback message when there are no pending variations", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(getPendingVariations).mockResolvedValue([]);
    const res = await POST(makeReq({ action: "pendingVariations" }));
    const data = await res.json();
    expect(data.reply).toBe("No variations awaiting a decision.");
  });

  it("formats unpaid invoices without calling Claude", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(getUnpaidInvoices).mockResolvedValue([
      {
        id: "inv1", invoiceNumber: "INV-2026-0002", totalAmount: { toNumber: () => 3363 },
        sentAt: "2026-06-25T00:00:00.000Z", job: { customerName: "BHP", siteName: "Hay Point" },
      },
    ] as any);
    const res = await POST(makeReq({ action: "unpaidInvoices" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reply).toContain("BHP");
    expect(data.reply).toContain("INV-2026-0002");
    expect(data.reply).toContain("3363");
    expect(data.reply).toContain("(/invoices/inv1)");
    expect(getUnpaidInvoices).toHaveBeenCalledWith({ take: 20 });
  });

  it("returns a fallback message when there are no unpaid invoices", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(getUnpaidInvoices).mockResolvedValue([]);
    const res = await POST(makeReq({ action: "unpaidInvoices" }));
    const data = await res.json();
    expect(data.reply).toBe("No unpaid invoices — everything sent has been paid.");
  });
});
