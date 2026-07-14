import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: { customer: { findUnique: vi.fn() } },
}));

import { db } from "@/lib/db/client";
import { getCustomerById } from "../queries";

beforeEach(() => vi.clearAllMocks());

describe("getCustomerById", () => {
  it("returns the customer when found", async () => {
    vi.mocked(db.customer.findUnique).mockResolvedValue({ id: "c1", name: "Rio Tinto" } as any);
    const result = await getCustomerById("c1");
    expect(db.customer.findUnique).toHaveBeenCalledWith({ where: { id: "c1" } });
    expect(result).toEqual({ id: "c1", name: "Rio Tinto" });
  });

  it("returns null when not found", async () => {
    vi.mocked(db.customer.findUnique).mockResolvedValue(null);
    const result = await getCustomerById("missing");
    expect(result).toBeNull();
  });
});
