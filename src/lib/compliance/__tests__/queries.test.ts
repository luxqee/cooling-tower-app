import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {
    assignment: { findMany: vi.fn() },
    complianceDocument: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db/client";
import { getComplianceDocumentsForUser } from "../queries";

const INCLUDE = {
  template: { select: { name: true, type: true } },
  job: { select: { customerName: true, siteName: true } },
  createdBy: { select: { name: true } },
};

beforeEach(() => vi.clearAllMocks());

describe("getComplianceDocumentsForUser", () => {
  it("scopes to a technician's own assigned jobs", async () => {
    vi.mocked(db.assignment.findMany).mockResolvedValue([{ jobId: "j1" }, { jobId: "j2" }] as any);
    vi.mocked(db.complianceDocument.findMany).mockResolvedValue([]);

    await getComplianceDocumentsForUser({ id: "u1", role: "technician" });

    expect(db.assignment.findMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(db.complianceDocument.findMany).toHaveBeenCalledWith({
      where: { jobId: { in: ["j1", "j2"] } },
      include: INCLUDE,
      orderBy: { submittedAt: "desc" },
      take: 200,
    });
  });

  it("returns all documents company-wide for a non-technician role", async () => {
    vi.mocked(db.complianceDocument.findMany).mockResolvedValue([]);

    await getComplianceDocumentsForUser({ id: "u2", role: "admin" });

    expect(db.assignment.findMany).not.toHaveBeenCalled();
    expect(db.complianceDocument.findMany).toHaveBeenCalledWith({
      where: undefined,
      include: INCLUDE,
      orderBy: { submittedAt: "desc" },
      take: 200,
    });
  });
});
