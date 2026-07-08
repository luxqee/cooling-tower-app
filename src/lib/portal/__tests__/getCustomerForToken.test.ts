import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: { customerPortalToken: { findUnique: vi.fn() } },
}));

import { db } from "@/lib/db/client";
import { getCustomerForToken } from "../getCustomerForToken";

const mockCustomer = { id: "c1", name: "Rio Tinto" };

beforeEach(() => vi.clearAllMocks());

describe("getCustomerForToken", () => {
  it("returns null when the token does not exist", async () => {
    vi.mocked(db.customerPortalToken.findUnique).mockResolvedValue(null);
    const result = await getCustomerForToken("bad-token");
    expect(result).toBeNull();
  });

  it("returns null when the token is expired", async () => {
    vi.mocked(db.customerPortalToken.findUnique).mockResolvedValue({
      token: "expired-token",
      expiresAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
      customer: mockCustomer,
    } as any);
    const result = await getCustomerForToken("expired-token");
    expect(result).toBeNull();
  });

  it("returns the customer when the token is valid and not expired", async () => {
    vi.mocked(db.customerPortalToken.findUnique).mockResolvedValue({
      token: "good-token",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
      customer: mockCustomer,
    } as any);
    const result = await getCustomerForToken("good-token");
    expect(result).toEqual(mockCustomer);
  });
});
