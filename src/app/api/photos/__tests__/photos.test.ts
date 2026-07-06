import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ getSessionUser: vi.fn() }));

import { getSessionUser } from "@/lib/auth/clerk";
import { GET } from "../route";

const mockUser = { id: "u1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };

beforeEach(() => vi.clearAllMocks());

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
});
