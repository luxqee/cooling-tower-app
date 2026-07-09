import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {
    voiceNote: { findMany: vi.fn(), update: vi.fn() },
    aiAuditLog: { create: vi.fn() },
    businessProfile: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/ai/voice-note", () => ({ summarizeTranscript: vi.fn() }));

import { db } from "@/lib/db/client";
import { summarizeTranscript } from "@/lib/ai/voice-note";
import { GET } from "../route";

const originalSecret = process.env.CRON_SECRET;

function makeReq(secret = "cron-secret-123") {
  return new Request("http://localhost/api/cron/finalize-voice-notes", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret-123";
});

afterEach(() => {
  process.env.CRON_SECRET = originalSecret;
});

describe("GET /api/cron/finalize-voice-notes", () => {
  it("returns 401 with the wrong secret", async () => {
    const res = await GET(makeReq("wrong"));
    expect(res.status).toBe(401);
  });

  it("returns finalized: 0 when there are no stale notes", async () => {
    vi.mocked(db.voiceNote.findMany).mockResolvedValue([]);
    const res = await GET(makeReq());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual({ finalized: 0, checked: 0 });
  });

  it("summarizes a stale note's original transcript and writes VoiceNote + AiAuditLog together", async () => {
    vi.mocked(db.voiceNote.findMany).mockResolvedValue([
      { id: "vn1", technicianId: "t1", transcript: "Replaced fan belt." },
    ] as any);
    vi.mocked(summarizeTranscript).mockResolvedValue({
      summary: { summary: "Replaced fan belt on Tower 3.", actionItems: [] },
      promptTokens: 100,
      outputTokens: 20,
    });
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}]);

    const res = await GET(makeReq());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ finalized: 1, checked: 1 });
    expect(summarizeTranscript).toHaveBeenCalledWith("Replaced fan belt.", undefined);
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("handles a Claude failure for one note without blocking the others", async () => {
    vi.mocked(db.voiceNote.findMany).mockResolvedValue([
      { id: "vn1", technicianId: "t1", transcript: "First note." },
      { id: "vn2", technicianId: "t2", transcript: "Second note." },
    ] as any);
    vi.mocked(summarizeTranscript)
      .mockRejectedValueOnce(new Error("Claude API error"))
      .mockResolvedValueOnce({
        summary: { summary: "Second note summarized.", actionItems: [] },
        promptTokens: 90,
        outputTokens: 15,
      });
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}]);

    const res = await GET(makeReq());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ finalized: 2, checked: 2 });
    // First note: graceful-degradation update (no summary), not the $transaction path.
    expect(db.voiceNote.update).toHaveBeenCalledWith({ where: { id: "vn1" }, data: { status: "transcribed" } });
  });
});
