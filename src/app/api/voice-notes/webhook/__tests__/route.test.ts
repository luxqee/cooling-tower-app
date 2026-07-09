import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {
    voiceNote: { findUnique: vi.fn(), update: vi.fn() },
    aiAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/ai/assemblyai", () => ({ fetchTranscript: vi.fn() }));
vi.mock("@/lib/ai/voice-note", () => ({ summarizeTranscript: vi.fn() }));

import { db } from "@/lib/db/client";
import { fetchTranscript } from "@/lib/ai/assemblyai";
import { summarizeTranscript } from "@/lib/ai/voice-note";
import { POST } from "../route";

const originalSecret = process.env.ASSEMBLYAI_WEBHOOK_SECRET;

function makeReq(body: unknown, secret = "correct-secret") {
  return new Request("http://localhost/api/voice-notes/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-secret": secret },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ASSEMBLYAI_WEBHOOK_SECRET = "correct-secret";
});

afterEach(() => {
  process.env.ASSEMBLYAI_WEBHOOK_SECRET = originalSecret;
});

describe("POST /api/voice-notes/webhook", () => {
  it("returns 401 when the shared secret header is wrong", async () => {
    const res = await POST(makeReq({ transcript_id: "t1" }, "wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when transcript_id is missing", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when no VoiceNote matches the transcript id", async () => {
    vi.mocked(db.voiceNote.findUnique).mockResolvedValue(null);
    const res = await POST(makeReq({ transcript_id: "t1" }));
    expect(res.status).toBe(404);
  });

  it("marks the voice note failed when AssemblyAI reports an error status", async () => {
    vi.mocked(db.voiceNote.findUnique).mockResolvedValue({ id: "vn1", technicianId: "u1" } as any);
    vi.mocked(fetchTranscript).mockResolvedValue({ status: "error", text: null, error: "Transcoding failed" });

    const res = await POST(makeReq({ transcript_id: "t1" }));

    expect(res.status).toBe(200);
    expect(db.voiceNote.update).toHaveBeenCalledWith({ where: { id: "vn1" }, data: { status: "failed" } });
  });

  it("summarizes a completed transcript and writes both VoiceNote and AiAuditLog in one transaction", async () => {
    vi.mocked(db.voiceNote.findUnique).mockResolvedValue({ id: "vn1", technicianId: "u1" } as any);
    vi.mocked(fetchTranscript).mockResolvedValue({ status: "completed", text: "Replaced fan belt on Tower 3.", error: null });
    vi.mocked(summarizeTranscript).mockResolvedValue({
      summary: { summary: "Replaced fan belt on Tower 3.", actionItems: [] },
      promptTokens: 100,
      outputTokens: 30,
    });
    vi.mocked(db.voiceNote.update).mockResolvedValue({} as any);
    vi.mocked(db.aiAuditLog.create).mockResolvedValue({} as any);
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}]);

    const res = await POST(makeReq({ transcript_id: "t1" }));

    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledWith([
      expect.objectContaining({}),
      expect.objectContaining({}),
    ]);
  });

  it("saves the raw transcript and marks transcribed even if Claude summarization throws", async () => {
    vi.mocked(db.voiceNote.findUnique).mockResolvedValue({ id: "vn1", technicianId: "u1" } as any);
    vi.mocked(fetchTranscript).mockResolvedValue({ status: "completed", text: "Replaced fan belt on Tower 3.", error: null });
    vi.mocked(summarizeTranscript).mockRejectedValue(new Error("Claude API error"));

    const res = await POST(makeReq({ transcript_id: "t1" }));

    expect(res.status).toBe(200);
    expect(db.voiceNote.update).toHaveBeenCalledWith({
      where: { id: "vn1" },
      data: { transcript: "Replaced fan belt on Tower 3.", status: "transcribed" },
    });
  });
});
