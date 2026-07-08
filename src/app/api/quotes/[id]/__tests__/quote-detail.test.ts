import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { quote: { findUnique: vi.fn(), update: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET, PATCH } from "../route";

const QUOTE_ID = "77777777-7777-4777-8777-777777777777";
const mockSalesEngineer = { id: "u1", role: "sales_engineer" as const, name: "Sam", clerkId: "c1", email: "s@t.com", isActive: true };

function makeCtx() {
  return { params: { id: QUOTE_ID } };
}
function makePatchReq(body: unknown) {
  return new Request(`http://localhost/api/quotes/${QUOTE_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/quotes/[id]", () => {
  it("returns 404 when the quote does not exist", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.quote.findUnique).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/x"), makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns 200 with the quote", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.quote.findUnique).mockResolvedValue({
      id: QUOTE_ID, totalAmount: { toNumber: () => 760 }, status: "draft",
    } as any);
    const res = await GET(new Request("http://localhost/x"), makeCtx());
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/quotes/[id]", () => {
  it("returns 400 for an invalid status transition value", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    const res = await PATCH(makePatchReq({ status: "not_a_status" }), makeCtx());
    expect(res.status).toBe(400);
  });

  it("returns 200 and updates status to sent", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.quote.update).mockResolvedValue({
      id: QUOTE_ID, status: "sent", totalAmount: { toNumber: () => 760 },
    } as any);
    const res = await PATCH(makePatchReq({ status: "sent" }), makeCtx());
    expect(res.status).toBe(200);
    expect(db.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: QUOTE_ID }, data: { status: "sent" } })
    );
  });
});
