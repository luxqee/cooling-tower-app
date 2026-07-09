import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));

import { requireRole } from "@/lib/auth/clerk";
import { put } from "@vercel/blob";
import { POST } from "../route";

const mockTechnician = { id: "t1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };

function makeReq(file: Blob | null) {
  const formData = new FormData();
  if (file) formData.append("file", file, "note.webm");
  return new Request("http://localhost/api/upload/voice-note", { method: "POST", body: formData });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/upload/voice-note", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq(new Blob(["audio"], { type: "audio/webm" })));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file is provided", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    const res = await POST(makeReq(null));
    expect(res.status).toBe(400);
  });

  it("returns 422 for an unsupported audio type", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    const res = await POST(makeReq(new Blob(["audio"], { type: "audio/x-unsupported" })));
    expect(res.status).toBe(422);
  });

  it("returns 413 when the file exceeds the size limit", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    const bigChunk = new Uint8Array(26 * 1024 * 1024);
    const res = await POST(makeReq(new Blob([bigChunk], { type: "audio/webm" })));
    expect(res.status).toBe(413);
  });

  it("uploads a valid file privately and returns its URL", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockTechnician as any);
    vi.mocked(put).mockResolvedValue({ url: "https://example.blob.vercel-storage.com/voice-notes/t1/123.webm" } as any);

    const res = await POST(makeReq(new Blob(["audio"], { type: "audio/webm" })));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.url).toBe("https://example.blob.vercel-storage.com/voice-notes/t1/123.webm");
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^voice-notes\/t1\/\d+\.webm$/),
      expect.anything(),
      { access: "private" }
    );
  });
});
