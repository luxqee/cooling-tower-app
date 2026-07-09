import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    voiceNote: { findFirst: vi.fn(), update: vi.fn() },
    voiceNotePhoto: { createMany: vi.fn() },
    aiAuditLog: { create: vi.fn() },
    businessProfile: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/ai/voice-note", () => ({ summarizeTranscript: vi.fn() }));
vi.mock("@/lib/ai/semanticSearch", () => ({ indexDocument: vi.fn() }));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { summarizeTranscript } from "@/lib/ai/voice-note";
import { indexDocument } from "@/lib/ai/semanticSearch";
import { POST } from "../route";

const mockTechnician = { id: "t1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };

function makeReq(body: unknown) {
  return new Request("http://localhost/api/jobs/job1/voice-notes/vn1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/jobs/[id]/voice-notes/[voiceNoteId]/send", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq({ transcript: "x" }), { params: { id: "job1", voiceNoteId: "vn1" } });
    expect(res.status).toBe(401);
  });

  it("returns 400 for an empty transcript", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    const res = await POST(makeReq({ transcript: "" }), { params: { id: "job1", voiceNoteId: "vn1" } });
    expect(res.status).toBe(400);
  });

  it("returns 404 when no matching awaiting_review note exists for this technician/job", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue(null);

    const res = await POST(makeReq({ transcript: "Replaced fan belt." }), { params: { id: "job1", voiceNoteId: "vn1" } });

    expect(res.status).toBe(404);
    expect(db.voiceNote.findFirst).toHaveBeenCalledWith({
      where: { id: "vn1", jobId: "job1", technicianId: "t1", status: "awaiting_review" },
    });
  });

  it("summarizes the EDITED transcript (not any original) and writes VoiceNote + AiAuditLog together on success", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", technicianId: "t1" } as any);
    vi.mocked(summarizeTranscript).mockResolvedValue({
      summary: { summary: "Replaced fan belt on Tower 3, corrected from technician edit.", actionItems: ["Order spare belt"] },
      promptTokens: 120,
      outputTokens: 35,
    });
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}]);

    const res = await POST(makeReq({ transcript: "Replaced fan belt on Tower 3 (technician-corrected text)." }), { params: { id: "job1", voiceNoteId: "vn1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(summarizeTranscript).toHaveBeenCalledWith(
      "Replaced fan belt on Tower 3 (technician-corrected text).",
      undefined
    );
    expect(db.$transaction).toHaveBeenCalled();
  });

  it("passes the business profile's industryDescription through to summarizeTranscript", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", technicianId: "t1" } as any);
    vi.mocked(db.businessProfile.findFirst).mockResolvedValue({ industryDescription: "HVAC servicing" } as any);
    vi.mocked(summarizeTranscript).mockResolvedValue({
      summary: { summary: "x", actionItems: [] },
      promptTokens: 10,
      outputTokens: 5,
    });
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}]);

    await POST(makeReq({ transcript: "Replaced fan belt." }), { params: { id: "job1", voiceNoteId: "vn1" } });

    expect(summarizeTranscript).toHaveBeenCalledWith("Replaced fan belt.", "HVAC servicing");
  });

  it("degrades gracefully when Claude throws: saves the edited transcript, marks transcribed, no audit log", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", technicianId: "t1" } as any);
    vi.mocked(summarizeTranscript).mockRejectedValue(new Error("Claude API error"));

    const res = await POST(makeReq({ transcript: "Replaced fan belt on Tower 3." }), { params: { id: "job1", voiceNoteId: "vn1" } });

    expect(res.status).toBe(200);
    expect(db.voiceNote.update).toHaveBeenCalledWith({
      where: { id: "vn1" },
      data: { transcript: "Replaced fan belt on Tower 3.", status: "transcribed" },
    });
    expect(db.aiAuditLog.create).not.toHaveBeenCalled();
  });

  it("returns 400 when a photoUrl isn't owned by the caller", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", technicianId: "t1" } as any);

    const res = await POST(
      makeReq({ transcript: "x", photoUrls: ["https://example.blob.vercel-storage.com/variations/OTHER-USER/1.jpg"] }),
      { params: { id: "job1", voiceNoteId: "vn1" } }
    );

    expect(res.status).toBe(400);
    expect(db.voiceNote.update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("creates VoiceNotePhoto rows for each photoUrl alongside a successful summary", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", technicianId: "t1" } as any);
    vi.mocked(summarizeTranscript).mockResolvedValue({
      summary: { summary: "Fixed it.", actionItems: [] },
      promptTokens: 100,
      outputTokens: 20,
    });
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}]);
    vi.mocked(db.voiceNotePhoto.createMany).mockResolvedValue({ count: 1 } as any);

    const photoUrl = "https://example.blob.vercel-storage.com/variations/t1/1.jpg";
    await POST(makeReq({ transcript: "Fixed it.", photoUrls: [photoUrl] }), { params: { id: "job1", voiceNoteId: "vn1" } });

    expect(db.voiceNotePhoto.createMany).toHaveBeenCalledWith({
      data: [{ voiceNoteId: "vn1", photoUrl }],
    });
  });

  it("still creates VoiceNotePhoto rows even when Claude summarization fails", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", technicianId: "t1" } as any);
    vi.mocked(summarizeTranscript).mockRejectedValue(new Error("Claude API error"));
    vi.mocked(db.voiceNotePhoto.createMany).mockResolvedValue({ count: 1 } as any);

    const photoUrl = "https://example.blob.vercel-storage.com/variations/t1/1.jpg";
    const res = await POST(makeReq({ transcript: "x", photoUrls: [photoUrl] }), { params: { id: "job1", voiceNoteId: "vn1" } });

    expect(res.status).toBe(200);
    expect(db.voiceNotePhoto.createMany).toHaveBeenCalledWith({
      data: [{ voiceNoteId: "vn1", photoUrl }],
    });
  });

  it("indexes the sent transcript for semantic search on success", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", technicianId: "t1", jobId: "job1" } as any);
    vi.mocked(summarizeTranscript).mockResolvedValue({
      summary: { summary: "Fixed it.", actionItems: [] },
      promptTokens: 100,
      outputTokens: 20,
    });
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}]);
    vi.mocked(db.voiceNotePhoto.createMany).mockResolvedValue({ count: 0 } as any);
    vi.mocked(indexDocument).mockResolvedValue(undefined);

    await POST(makeReq({ transcript: "Replaced fan belt on Tower 3." }), { params: { id: "job1", voiceNoteId: "vn1" } });

    expect(indexDocument).toHaveBeenCalledWith("VoiceNote", "vn1", "job1", "Replaced fan belt on Tower 3.");
  });

  it("does not fail the request if indexing throws", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", technicianId: "t1", jobId: "job1" } as any);
    vi.mocked(summarizeTranscript).mockResolvedValue({
      summary: { summary: "Fixed it.", actionItems: [] },
      promptTokens: 100,
      outputTokens: 20,
    });
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}]);
    vi.mocked(db.voiceNotePhoto.createMany).mockResolvedValue({ count: 0 } as any);
    vi.mocked(indexDocument).mockRejectedValue(new Error("Voyage down"));

    const res = await POST(makeReq({ transcript: "x" }), { params: { id: "job1", voiceNoteId: "vn1" } });

    expect(res.status).toBe(200);
  });
});
