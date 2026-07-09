import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {
    job: { findMany: vi.fn() },
    complianceTemplate: { findMany: vi.fn() },
    complianceDocument: { findMany: vi.fn() },
    assignment: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/ai/semanticSearch", () => ({ semanticSearch: vi.fn() }));

import { db } from "@/lib/db/client";
import { semanticSearch } from "@/lib/ai/semanticSearch";
import { findJobs, findComplianceDocuments, findAssignments, semanticSearchTool } from "../read";

beforeEach(() => vi.clearAllMocks());

describe("findJobs", () => {
  it("filters by status, siteName, and customerName when provided", async () => {
    vi.mocked(db.job.findMany).mockResolvedValue([{ id: "j1", customerName: "Rio Tinto", siteName: "Weipa", status: "active" }] as any);

    const result = await findJobs({ status: "active", siteName: "Weipa", customerName: "Rio Tinto" });

    expect(db.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "active",
          siteName: { contains: "Weipa", mode: "insensitive" },
          customerName: { contains: "Rio Tinto", mode: "insensitive" },
        }),
      })
    );
    expect(result).toHaveLength(1);
  });

  it("filters overdue jobs (active, logged hours exceed quoted) when overdueOnly is true", async () => {
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    await findJobs({ overdueOnly: true });
    expect(db.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "active" }) })
    );
  });

  it("returns all jobs (capped) when no filters are given", async () => {
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    await findJobs({});
    expect(db.job.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
  });
});

describe("findComplianceDocuments", () => {
  it("returns templates missing a submitted document for a given job", async () => {
    vi.mocked(db.complianceTemplate.findMany).mockResolvedValue([
      { id: "tmpl1", name: "SWMS", type: "SWMS" },
      { id: "tmpl2", name: "JSA", type: "JSA" },
    ] as any);
    vi.mocked(db.complianceDocument.findMany).mockResolvedValue([{ templateId: "tmpl2" }] as any);

    const result = await findComplianceDocuments({ jobId: "job1" });

    expect(result).toEqual([{ templateId: "tmpl1", templateName: "SWMS" }]);
  });
});

describe("findAssignments", () => {
  it("filters by technician name when provided", async () => {
    vi.mocked(db.assignment.findMany).mockResolvedValue([]);
    await findAssignments({ technicianName: "Jake" });
    expect(db.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user: { name: { contains: "Jake", mode: "insensitive" } } }),
      })
    );
  });
});

describe("semanticSearchTool", () => {
  it("delegates to semanticSearch with the query and optional jobId", async () => {
    vi.mocked(semanticSearch).mockResolvedValue([
      { id: "c1", sourceType: "VoiceNote", sourceId: "vn1", jobId: "job1", chunkText: "corrosion noted", distance: 0.1 },
    ]);

    const result = await semanticSearchTool({ query: "corrosion", jobId: "job1" });

    expect(semanticSearch).toHaveBeenCalledWith("corrosion", "job1");
    expect(result).toHaveLength(1);
  });
});
