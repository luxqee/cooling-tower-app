import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { voiceNote: { findMany: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET } from "../route";

const mockTechnician = { id: "t1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };

function makeReq() {
  return new Request("http://localhost/api/jobs/job1/voice-notes/pending-review");
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/jobs/[id]/voice-notes/pending-review", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(makeReq(), { params: { id: "job1" } });
    expect(res.status).toBe(401);
  });

  it("scopes the query to this job, this technician, and awaiting_review status only", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findMany).mockResolvedValue([]);

    await GET(makeReq(), { params: { id: "job1" } });

    expect(db.voiceNote.findMany).toHaveBeenCalledWith({
      where: { jobId: "job1", technicianId: "t1", status: "awaiting_review" },
      orderBy: { createdAt: "asc" },
      select: { id: true, transcript: true, createdAt: true },
    });
  });

  it("returns the matching notes", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(db.voiceNote.findMany).mockResolvedValue([
      { id: "vn1", transcript: "Replaced fan belt.", createdAt: new Date("2026-07-09T00:00:00Z") },
    ] as any);

    const res = await GET(makeReq(), { params: { id: "job1" } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("vn1");
    expect(data[0].transcript).toBe("Replaced fan belt.");
  });
});
