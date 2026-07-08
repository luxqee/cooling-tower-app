import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { findFirst: vi.fn() },
    aiAuditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/ai/client", () => ({
  getAnthropicClient: vi.fn(),
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getAnthropicClient } from "@/lib/ai/client";
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

  it("returns a rule-layer duplicate flag WITHOUT calling Claude", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "existing-job" } as any);
    const res = await POST(makeReq(validBody));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.flags).toHaveLength(1);
    expect(data.flags[0].field).toBe("siteName");
    expect(getAnthropicClient).not.toHaveBeenCalled();
  });

  it("calls Claude and returns its flags when no duplicate is found", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findFirst).mockResolvedValue(null);
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ flags: [{ field: "quotedHours", severity: "info", message: "32 hours is high for a routine inspection", suggestion: "Confirm scope with the customer" }] }) }],
      usage: { input_tokens: 200, output_tokens: 50 },
    });
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: mockCreate } } as any);
    vi.mocked(db.aiAuditLog.create).mockResolvedValue({} as any);

    const res = await POST(makeReq(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.flags).toHaveLength(1);
    expect(data.flags[0].field).toBe("quotedHours");
    expect(db.aiAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: mockDirector.id, feature: "validation", promptTokens: 200, outputTokens: 50 }),
      })
    );
  });

  it("returns an empty flags array (not an error) when the Claude call throws", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findFirst).mockResolvedValue(null);
    const mockCreate = vi.fn().mockRejectedValue(new Error("network error"));
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: mockCreate } } as any);

    const res = await POST(makeReq(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.flags).toEqual([]);
    expect(db.aiAuditLog.create).not.toHaveBeenCalled();
  });
});
