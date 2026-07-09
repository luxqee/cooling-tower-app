import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../voyage", () => ({ embedText: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { $executeRawUnsafe: vi.fn(), $queryRawUnsafe: vi.fn() },
}));

import { embedText } from "../voyage";
import { db } from "@/lib/db/client";
import { indexDocument, semanticSearch } from "../semanticSearch";

beforeEach(() => vi.clearAllMocks());

describe("indexDocument", () => {
  it("embeds the text and inserts a DocumentChunk row via raw SQL", async () => {
    vi.mocked(embedText).mockResolvedValue([0.1, 0.2, 0.3]);
    vi.mocked(db.$executeRawUnsafe).mockResolvedValue(1);

    await indexDocument("VoiceNote", "vn1", "job1", "Replaced fan belt on Tower 3.");

    expect(embedText).toHaveBeenCalledWith("Replaced fan belt on Tower 3.");
    expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO \"DocumentChunk\""),
      expect.any(String),
      "VoiceNote",
      "vn1",
      "job1",
      "Replaced fan belt on Tower 3.",
      "[0.1,0.2,0.3]"
    );
  });
});

describe("semanticSearch", () => {
  it("embeds the query and runs a similarity query scoped to a job when jobId is given", async () => {
    vi.mocked(embedText).mockResolvedValue([0.4, 0.5]);
    vi.mocked(db.$queryRawUnsafe).mockResolvedValue([
      { id: "c1", sourceType: "VoiceNote", sourceId: "vn1", jobId: "job1", chunkText: "corrosion on tower 2", distance: 0.12 },
    ]);

    const results = await semanticSearch("corrosion", "job1");

    expect(embedText).toHaveBeenCalledWith("corrosion");
    expect(results).toHaveLength(1);
    expect(results[0].chunkText).toBe("corrosion on tower 2");
    const [sql, , jobArg] = vi.mocked(db.$queryRawUnsafe).mock.calls[0];
    expect(sql).toContain("WHERE \"jobId\"");
    expect(jobArg).toBe("job1");
  });

  it("runs an unscoped similarity query when jobId is omitted", async () => {
    vi.mocked(embedText).mockResolvedValue([0.4, 0.5]);
    vi.mocked(db.$queryRawUnsafe).mockResolvedValue([]);

    await semanticSearch("corrosion");

    const [sql] = vi.mocked(db.$queryRawUnsafe).mock.calls[0];
    expect(sql).not.toContain("WHERE \"jobId\"");
  });
});
