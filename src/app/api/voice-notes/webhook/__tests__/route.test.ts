import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {
    voiceNote: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/ai/assemblyai", () => ({ fetchTranscript: vi.fn() }));

import { db } from "@/lib/db/client";
import { fetchTranscript } from "@/lib/ai/assemblyai";
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

  it("returns 401 for a same-length but incorrect secret (exercises the constant-time compare, not just a length check)", async () => {
    // "wrong-password" is exactly 14 chars, same as "correct-secret"
    const res = await POST(makeReq({ transcript_id: "t1" }, "wrong-password"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the secret header is missing entirely", async () => {
    const req = new Request("http://localhost/api/voice-notes/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript_id: "t1" }),
    });
    const res = await POST(req);
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
    vi.mocked(db.voiceNote.findUnique).mockResolvedValue({ id: "vn1" } as any);
    vi.mocked(fetchTranscript).mockResolvedValue({ status: "error", text: null, error: "Transcoding failed" });

    const res = await POST(makeReq({ transcript_id: "t1" }));

    expect(res.status).toBe(200);
    expect(db.voiceNote.update).toHaveBeenCalledWith({ where: { id: "vn1" }, data: { status: "failed" } });
  });

  it("marks the voice note failed when AssemblyAI reports completed but with no text", async () => {
    vi.mocked(db.voiceNote.findUnique).mockResolvedValue({ id: "vn1" } as any);
    vi.mocked(fetchTranscript).mockResolvedValue({ status: "completed", text: null, error: null });

    const res = await POST(makeReq({ transcript_id: "t1" }));

    expect(res.status).toBe(200);
    expect(db.voiceNote.update).toHaveBeenCalledWith({ where: { id: "vn1" }, data: { status: "failed" } });
  });

  it("saves the raw transcript and marks awaiting_review on a completed transcription", async () => {
    vi.mocked(db.voiceNote.findUnique).mockResolvedValue({ id: "vn1" } as any);
    vi.mocked(fetchTranscript).mockResolvedValue({ status: "completed", text: "Replaced fan belt on Tower 3.", error: null });

    const res = await POST(makeReq({ transcript_id: "t1" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(db.voiceNote.update).toHaveBeenCalledWith({
      where: { id: "vn1" },
      data: { transcript: "Replaced fan belt on Tower 3.", status: "awaiting_review" },
    });
  });
});
