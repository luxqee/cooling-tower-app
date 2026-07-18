import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@vercel/blob", () => ({ list: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { count: vi.fn() },
    customer: { count: vi.fn() },
    invoice: { count: vi.fn() },
    quote: { count: vi.fn() },
    variation: { count: vi.fn() },
    complianceDocument: { count: vi.fn() },
    voiceNote: { count: vi.fn() },
    timeEntry: { count: vi.fn() },
    user: { count: vi.fn() },
    assignment: { count: vi.fn() },
    materialEntry: { count: vi.fn() },
    jobCommunication: { count: vi.fn() },
    documentChunk: { count: vi.fn() },
    aiAuditLog: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { list } from "@vercel/blob";
import { db } from "@/lib/db/client";
import { getMonitoringStats } from "../getStats";

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of [
    db.job, db.customer, db.invoice, db.quote, db.variation, db.complianceDocument,
    db.voiceNote, db.timeEntry, db.user, db.assignment, db.materialEntry, db.jobCommunication, db.documentChunk,
  ] as const) {
    vi.mocked(model.count).mockResolvedValue(0);
  }
  vi.mocked(db.aiAuditLog.findMany).mockResolvedValue([]);
  vi.mocked(db.$queryRaw).mockResolvedValue([{ bytes: BigInt(123456), pretty: "121 kB" }]);
  vi.mocked(list).mockResolvedValue({ blobs: [], cursor: undefined, hasMore: false } as any);
});

describe("getMonitoringStats", () => {
  it("returns a row count entry for every major table", async () => {
    vi.mocked(db.job.count).mockResolvedValue(11);
    vi.mocked(db.customer.count).mockResolvedValue(7);

    const stats = await getMonitoringStats();

    expect(stats.rowCounts.find((r) => r.label === "Jobs")?.count).toBe(11);
    expect(stats.rowCounts.find((r) => r.label === "Customers")?.count).toBe(7);
    expect(stats.rowCounts).toHaveLength(13);
  });

  it("returns the database size when the query succeeds", async () => {
    const stats = await getMonitoringStats();
    expect(stats.databaseSizeBytes).toBe(123456);
    expect(stats.databaseSizePretty).toBe("121 kB");
  });

  it("degrades gracefully when the database size query fails", async () => {
    vi.mocked(db.$queryRaw).mockRejectedValue(new Error("permission denied"));
    const stats = await getMonitoringStats();
    expect(stats.databaseSizeBytes).toBeNull();
    expect(stats.databaseSizePretty).toBeNull();
  });

  it("groups blob storage usage by top-level prefix", async () => {
    vi.mocked(list).mockResolvedValue({
      blobs: [
        { pathname: "compliance/a.pdf", size: 1000, url: "x", uploadedAt: new Date(), downloadUrl: "x" },
        { pathname: "compliance/b.pdf", size: 2000, url: "x", uploadedAt: new Date(), downloadUrl: "x" },
        { pathname: "voice-notes/j1/c.webm", size: 5000, url: "x", uploadedAt: new Date(), downloadUrl: "x" },
      ],
      cursor: undefined,
      hasMore: false,
    } as any);

    const stats = await getMonitoringStats();

    expect(stats.blobTotalCount).toBe(3);
    expect(stats.blobTotalBytes).toBe(8000);
    expect(stats.blobUsage).toEqual(
      expect.arrayContaining([
        { prefix: "compliance", count: 2, bytes: 3000 },
        { prefix: "voice-notes", count: 1, bytes: 5000 },
      ])
    );
  });

  it("degrades gracefully when blob storage listing fails", async () => {
    vi.mocked(list).mockRejectedValue(new Error("network error"));
    const stats = await getMonitoringStats();
    expect(stats.blobUsage).toEqual([]);
    expect(stats.blobTotalBytes).toBe(0);
    expect(stats.blobTotalCount).toBe(0);
  });

  it("aggregates AI cost by feature", async () => {
    vi.mocked(db.aiAuditLog.findMany).mockResolvedValue([
      { feature: "voice_note", promptTokens: 100, outputTokens: 20, costUsd: "0.001" },
      { feature: "voice_note", promptTokens: 200, outputTokens: 40, costUsd: "0.002" },
      { feature: "company_assistant", promptTokens: 500, outputTokens: 100, costUsd: "0.01" },
    ] as any);

    const stats = await getMonitoringStats();

    const voiceNote = stats.aiCostByFeature.find((f) => f.feature === "voice_note");
    expect(voiceNote).toEqual({ feature: "voice_note", calls: 2, promptTokens: 300, outputTokens: 60, costUsd: 0.003 });
    expect(stats.aiTotalCostUsd).toBeCloseTo(0.013, 6);
  });
});
