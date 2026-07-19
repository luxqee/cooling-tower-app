import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: { variation: { findMany: vi.fn() } },
}));

import { db } from "@/lib/db/client";
import { getPendingVariations } from "../queries";

const INCLUDE = {
  technician: { select: { name: true } },
  job: { select: { id: true, customerName: true, siteName: true } },
};

beforeEach(() => vi.clearAllMocks());

describe("getPendingVariations", () => {
  it("defaults to ascending order with no take limit", async () => {
    vi.mocked(db.variation.findMany).mockResolvedValue([]);
    await getPendingVariations();
    expect(db.variation.findMany).toHaveBeenCalledWith({
      where: { status: "pending" },
      include: INCLUDE,
      orderBy: { submittedAt: "asc" },
    });
  });

  it("supports descending order and a take limit", async () => {
    vi.mocked(db.variation.findMany).mockResolvedValue([]);
    await getPendingVariations({ order: "desc", take: 100 });
    expect(db.variation.findMany).toHaveBeenCalledWith({
      where: { status: "pending" },
      include: INCLUDE,
      orderBy: { submittedAt: "desc" },
      take: 100,
    });
  });
});
