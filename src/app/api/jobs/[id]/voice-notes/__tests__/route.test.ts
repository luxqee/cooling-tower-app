import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    assignment: { findFirst: vi.fn() },
    voiceNote: { create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/jobs/queries", () => ({ getActiveJobById: vi.fn() }));
vi.mock("@/lib/ai/assemblyai", () => ({
  uploadAudioToAssemblyAI: vi.fn(),
  submitTranscription: vi.fn(),
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getActiveJobById } from "@/lib/jobs/queries";
import { uploadAudioToAssemblyAI, submitTranscription } from "@/lib/ai/assemblyai";
import { POST } from "../route";

const mockTechnician = { id: "t1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };
const validBody = { audioUrl: "https://example.blob.vercel-storage.com/voice-notes/t1/123.webm", durationSeconds: 60, mediaType: "audio" };

function makeReq(body: unknown) {
  return new Request("http://localhost/api/jobs/job1/voice-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new TextEncoder().encode("fake audio").buffer,
  }) as unknown as typeof fetch;
});

describe("POST /api/jobs/[id]/voice-notes", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq(validBody), { params: { id: "job1" } });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    const res = await POST(makeReq({ audioUrl: "not-a-url" }), { params: { id: "job1" } });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the job doesn't exist or isn't active/scheduled", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(getActiveJobById).mockResolvedValue(null);
    const res = await POST(makeReq(validBody), { params: { id: "job1" } });
    expect(res.status).toBe(404);
  });

  it("returns 403 when the technician isn't assigned to the job", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(getActiveJobById).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue(null);
    const res = await POST(makeReq(validBody), { params: { id: "job1" } });
    expect(res.status).toBe(403);
  });

  it("returns 400 and never creates a voice note when audioUrl hostname isn't blob storage", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(getActiveJobById).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);

    const res = await POST(
      makeReq({ audioUrl: "https://attacker.example/collect", durationSeconds: 60 }),
      { params: { id: "job1" } }
    );

    expect(res.status).toBe(400);
    expect(db.voiceNote.create).not.toHaveBeenCalled();
  });

  it("returns 400 and never creates a voice note when audioUrl path belongs to a different technician", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(getActiveJobById).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);

    const res = await POST(
      makeReq({
        audioUrl: "https://example.blob.vercel-storage.com/voice-notes/other-tech/123.webm",
        durationSeconds: 60,
      }),
      { params: { id: "job1" } }
    );

    expect(res.status).toBe(400);
    expect(db.voiceNote.create).not.toHaveBeenCalled();
  });

  it("creates the voice note and submits it to AssemblyAI on success", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(getActiveJobById).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);
    vi.mocked(db.voiceNote.create).mockResolvedValue({ id: "vn1", jobId: "job1", technicianId: "t1", status: "pending" } as any);
    vi.mocked(uploadAudioToAssemblyAI).mockResolvedValue("https://cdn.assemblyai.com/upload/xyz");
    vi.mocked(submitTranscription).mockResolvedValue({ id: "transcript-abc" });
    vi.mocked(db.voiceNote.update).mockResolvedValue({} as any);

    const res = await POST(makeReq(validBody), { params: { id: "job1" } });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.id).toBe("vn1");
    expect(db.voiceNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobId: "job1", technicianId: "t1", status: "pending", mediaType: "audio" }),
      })
    );
    expect(uploadAudioToAssemblyAI).toHaveBeenCalled();
    expect(submitTranscription).toHaveBeenCalled();
    expect(db.voiceNote.update).toHaveBeenCalledWith({
      where: { id: "vn1" },
      data: { assemblyaiId: "transcript-abc" },
    });
  });

  it("marks the voice note failed (but still returns 201) when AssemblyAI submission throws", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(getActiveJobById).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);
    vi.mocked(db.voiceNote.create).mockResolvedValue({ id: "vn1", jobId: "job1", technicianId: "t1", status: "pending" } as any);
    vi.mocked(uploadAudioToAssemblyAI).mockRejectedValue(new Error("network error"));
    vi.mocked(db.voiceNote.update).mockResolvedValue({} as any);

    const res = await POST(makeReq(validBody), { params: { id: "job1" } });

    expect(res.status).toBe(201);
    expect(db.voiceNote.update).toHaveBeenCalledWith({ where: { id: "vn1" }, data: { status: "failed" } });
  });

  it("stores mediaType: video when a video recording is submitted", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(getActiveJobById).mockResolvedValue({ id: "job1" } as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);
    vi.mocked(db.voiceNote.create).mockResolvedValue({ id: "vn1", jobId: "job1", technicianId: "t1", status: "pending" } as any);
    vi.mocked(uploadAudioToAssemblyAI).mockResolvedValue("https://cdn.assemblyai.com/upload/xyz");
    vi.mocked(submitTranscription).mockResolvedValue({ id: "transcript-abc" });
    vi.mocked(db.voiceNote.update).mockResolvedValue({} as any);

    await POST(makeReq({ ...validBody, mediaType: "video" }), { params: { id: "job1" } });

    expect(db.voiceNote.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mediaType: "video" }) })
    );
  });
});
