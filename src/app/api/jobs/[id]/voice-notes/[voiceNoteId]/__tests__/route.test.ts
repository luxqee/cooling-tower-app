import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ getSessionUser: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    voiceNote: { findFirst: vi.fn(), delete: vi.fn() },
    voiceNotePhoto: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { getSessionUser } from "@/lib/auth/clerk";
import { del } from "@vercel/blob";
import { db } from "@/lib/db/client";
import { DELETE } from "../route";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const NOTE_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_JOB_ID = "33333333-3333-4333-8333-333333333333";

const mockDirector = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };
const mockTechnician = { id: "u2", role: "technician" as const, name: "Jake", clerkId: "c2", email: "j@t.com", isActive: true };
const mockOtherTechnician = { id: "u3", role: "technician" as const, name: "Sam", clerkId: "c3", email: "s@t.com", isActive: true };

const mockNote = {
  id: NOTE_ID,
  jobId: JOB_ID,
  technicianId: "u2",
  status: "awaiting_review",
  audioUrl: "https://blob.vercel-storage.com/voice-notes/u2/1.webm",
  photos: [
    { id: "p1", photoUrl: "https://blob.vercel-storage.com/variations/u2/1.jpg" },
    { id: "p2", photoUrl: "https://blob.vercel-storage.com/variations/u2/2.jpg" },
  ],
};

function makeReq() {
  return new Request(`http://localhost/api/jobs/${JOB_ID}/voice-notes/${NOTE_ID}`, { method: "DELETE" });
}

beforeEach(() => vi.clearAllMocks());

describe("DELETE /api/jobs/[id]/voice-notes/[voiceNoteId]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await DELETE(makeReq(), { params: { id: JOB_ID, voiceNoteId: NOTE_ID } });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the voice note doesn't exist for that job", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockDirector as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue(null);
    const res = await DELETE(makeReq(), { params: { id: JOB_ID, voiceNoteId: NOTE_ID } });
    expect(res.status).toBe(404);
  });

  it("scopes the lookup to the given jobId (won't find a note belonging to a different job)", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockDirector as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue(null);
    await DELETE(makeReq(), { params: { id: OTHER_JOB_ID, voiceNoteId: NOTE_ID } });
    expect(db.voiceNote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: NOTE_ID, jobId: OTHER_JOB_ID } })
    );
  });

  it("allows a director to delete any voice note", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockDirector as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue(mockNote as any);
    vi.mocked(db.$transaction).mockResolvedValue([{ count: 2 }, mockNote] as any);
    vi.mocked(del).mockResolvedValue(undefined as any);

    const res = await DELETE(makeReq(), { params: { id: JOB_ID, voiceNoteId: NOTE_ID } });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
    expect(db.voiceNotePhoto.deleteMany).toHaveBeenCalledWith({ where: { voiceNoteId: NOTE_ID } });
    expect(db.voiceNote.delete).toHaveBeenCalledWith({ where: { id: NOTE_ID } });
    expect(del).toHaveBeenCalledWith(mockNote.audioUrl);
    expect(del).toHaveBeenCalledWith(mockNote.photos[0].photoUrl);
    expect(del).toHaveBeenCalledWith(mockNote.photos[1].photoUrl);
  });

  it("allows a technician to delete their own not-yet-sent (awaiting_review) note", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue(mockNote as any);
    vi.mocked(db.$transaction).mockResolvedValue([{ count: 2 }, mockNote] as any);
    vi.mocked(del).mockResolvedValue(undefined as any);

    const res = await DELETE(makeReq(), { params: { id: JOB_ID, voiceNoteId: NOTE_ID } });

    expect(res.status).toBe(200);
    expect(db.voiceNote.delete).toHaveBeenCalledWith({ where: { id: NOTE_ID } });
  });

  it("returns 401 when a technician tries to delete another technician's note", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockOtherTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue(mockNote as any);

    const res = await DELETE(makeReq(), { params: { id: JOB_ID, voiceNoteId: NOTE_ID } });

    expect(res.status).toBe(401);
    expect(db.voiceNote.delete).not.toHaveBeenCalled();
  });

  it("returns 401 when a technician tries to delete their own note that's already been sent", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ ...mockNote, status: "transcribed" } as any);

    const res = await DELETE(makeReq(), { params: { id: JOB_ID, voiceNoteId: NOTE_ID } });

    expect(res.status).toBe(401);
    expect(db.voiceNote.delete).not.toHaveBeenCalled();
  });

  it("still returns ok even if a blob deletion fails (best-effort, DB is the source of truth)", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockDirector as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue(mockNote as any);
    vi.mocked(db.$transaction).mockResolvedValue([{ count: 2 }, mockNote] as any);
    vi.mocked(del).mockRejectedValue(new Error("blob not found"));

    const res = await DELETE(makeReq(), { params: { id: JOB_ID, voiceNoteId: NOTE_ID } });

    expect(res.status).toBe(200);
  });
});
