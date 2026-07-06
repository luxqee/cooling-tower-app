import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: vi.fn().mockResolvedValue({ url: "https://x.blob.vercel-storage.com/p.jpg" }) }));

import { requireRole } from "@/lib/auth/clerk";
import { POST } from "../photo/route";

const mockUser = { id: "u1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", isActive: true };

function makeFormData(type: string, size = 100) {
  const fd = new FormData();
  fd.append("file", new Blob(["x".repeat(size)], { type }), "photo.jpg");
  return fd;
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/upload/photo", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const req = new Request("http://localhost", { method: "POST", body: makeFormData("image/jpeg") });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file provided", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    const req = new Request("http://localhost", { method: "POST", body: new FormData() });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 422 for SVG file type", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    const req = new Request("http://localhost", { method: "POST", body: makeFormData("image/svg+xml") });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toMatch(/format/i);
  });

  it("returns 422 for PDF file type", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    const req = new Request("http://localhost", { method: "POST", body: makeFormData("application/pdf") });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("accepts JPEG and returns 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    const req = new Request("http://localhost", { method: "POST", body: makeFormData("image/jpeg") });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("accepts PNG and returns 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    const req = new Request("http://localhost", { method: "POST", body: makeFormData("image/png") });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("returns 413 when file exceeds 5MB", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    const req = new Request("http://localhost", { method: "POST", body: makeFormData("image/jpeg", 6 * 1024 * 1024) });
    const res = await POST(req);
    expect(res.status).toBe(413);
  });
});
