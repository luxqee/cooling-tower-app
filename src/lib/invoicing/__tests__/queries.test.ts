import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: { invoice: { findMany: vi.fn() } },
}));

import { db } from "@/lib/db/client";
import { getAllInvoicesWithJob } from "../queries";

const INCLUDE = {
  job: { select: { id: true, customerName: true, siteName: true, jobType: true } },
};

beforeEach(() => vi.clearAllMocks());

describe("getAllInvoicesWithJob", () => {
  it("queries all invoices with job context, newest first, no take by default", async () => {
    vi.mocked(db.invoice.findMany).mockResolvedValue([]);
    await getAllInvoicesWithJob();
    expect(db.invoice.findMany).toHaveBeenCalledWith({
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  });

  it("supports a take limit", async () => {
    vi.mocked(db.invoice.findMany).mockResolvedValue([]);
    await getAllInvoicesWithJob({ take: 100 });
    expect(db.invoice.findMany).toHaveBeenCalledWith({
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });
});
