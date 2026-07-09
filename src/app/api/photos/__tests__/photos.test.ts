import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    voiceNote: { findFirst: vi.fn() },
    voiceNotePhoto: { findFirst: vi.fn() },
    variation: { findFirst: vi.fn() },
  },
}));

import { getSessionUser } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET } from "../route";

const mockUser = { id: "u1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };
const mockDirector = { id: "u2", role: "director" as const, name: "Dana", clerkId: "c2", email: "d@t.com", isActive: true };
const BLOB_URL = "https://x.blob.vercel-storage.com/voice-notes/u1/1.webm";
const OTHER_USERS_BLOB_URL = "https://x.blob.vercel-storage.com/voice-notes/u3/1.webm";

function mockFullFetch() {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": "video/webm" }),
    body: new ReadableStream(),
  });
  global.fetch = mockFetch as unknown as typeof fetch;
  return mockFetch;
}

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = originalFetch;
});

describe("GET /api/photos", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/photos?url=https://x.blob.vercel-storage.com/f.pdf"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when url param is missing", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as any);
    const res = await GET(new Request("http://localhost/api/photos"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a URL that only contains the string but is not a Vercel Blob hostname", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as any);
    // SSRF test: hostname is attacker.com, path contains the blob domain string
    const malicious = "https://attacker.example.com/.blob.vercel-storage.com/steal";
    const res = await GET(new Request(`http://localhost/api/photos?url=${encodeURIComponent(malicious)}`));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-Vercel URL", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as any);
    const res = await GET(new Request("http://localhost/api/photos?url=https://evil.com/photo.jpg"));
    expect(res.status).toBe(400);
  });

  it("forwards the client's Range header to the upstream blob fetch", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as any);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 206,
      headers: new Headers({ "Content-Type": "video/webm", "Content-Range": "bytes 0-99/1000", "Content-Length": "100" }),
      body: new ReadableStream(),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const req = new Request(`http://localhost/api/photos?url=${encodeURIComponent(BLOB_URL)}`, {
      headers: { Range: "bytes=0-99" },
    });
    const res = await GET(req);

    expect(mockFetch).toHaveBeenCalledWith(
      BLOB_URL,
      expect.objectContaining({ headers: expect.objectContaining({ Range: "bytes=0-99" }) })
    );
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-99/1000");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
  });

  it("does not forward a Range header when the client didn't send one, and returns 200", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as any);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "video/webm" }),
      body: new ReadableStream(),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const req = new Request(`http://localhost/api/photos?url=${encodeURIComponent(BLOB_URL)}`);
    const res = await GET(req);

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.Range).toBeUndefined();
    expect(res.status).toBe(200);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
  });

  it("returns 403 for a technician requesting a blob uploaded by a different user", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as any);
    const mockFetch = mockFullFetch();

    const res = await GET(new Request(`http://localhost/api/photos?url=${encodeURIComponent(OTHER_USERS_BLOB_URL)}`));

    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 404 for an office role requesting a blob that isn't attached to any real record", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockDirector as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue(null);
    vi.mocked(db.voiceNotePhoto.findFirst).mockResolvedValue(null);
    vi.mocked(db.variation.findFirst).mockResolvedValue(null);
    const mockFetch = mockFullFetch();

    const res = await GET(new Request(`http://localhost/api/photos?url=${encodeURIComponent(OTHER_USERS_BLOB_URL)}`));

    expect(res.status).toBe(404);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("serves the blob for an office role when the url is a real VoiceNote.audioUrl", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockDirector as any);
    vi.mocked(db.voiceNote.findFirst).mockResolvedValue({ id: "vn1", audioUrl: OTHER_USERS_BLOB_URL } as any);
    vi.mocked(db.voiceNotePhoto.findFirst).mockResolvedValue(null);
    vi.mocked(db.variation.findFirst).mockResolvedValue(null);
    mockFullFetch();

    const res = await GET(new Request(`http://localhost/api/photos?url=${encodeURIComponent(OTHER_USERS_BLOB_URL)}`));

    expect(res.status).toBe(200);
  });

  it("always allows a caller to view their own upload without a DB lookup", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as any);
    const mockFetch = mockFullFetch();

    const res = await GET(new Request(`http://localhost/api/photos?url=${encodeURIComponent(BLOB_URL)}`));

    expect(res.status).toBe(200);
    expect(db.voiceNote.findFirst).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalled();
  });
});
