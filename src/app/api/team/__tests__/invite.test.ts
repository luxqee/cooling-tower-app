import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({
  requireRole: vi.fn(),
}));

import { requireRole } from "@/lib/auth/clerk";
import { POST } from "../invite/route";

const mockRequireRole = vi.mocked(requireRole);

const director = { id: "dir-1", name: "Test Director", email: "dir@test.com", role: "director" as const, clerkId: "clerk-1", isActive: true };

function makeReq(body: unknown) {
  return new Request("http://localhost/api/team/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("POST /api/team/invite", () => {
  it("returns 401 when caller is not a director", async () => {
    mockRequireRole.mockRejectedValue(new Error("Forbidden"));
    const res = await POST(makeReq({ email: "a@b.com", role: "technician" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid email format", async () => {
    mockRequireRole.mockResolvedValue(director);
    const res = await POST(makeReq({ email: "not-an-email", role: "technician" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid role", async () => {
    mockRequireRole.mockResolvedValue(director);
    const res = await POST(makeReq({ email: "a@b.com", role: "janitor" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 on successful invite", async () => {
    mockRequireRole.mockResolvedValue(director);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const res = await POST(makeReq({ email: "new@tech.com", role: "technician" }));
    expect(res.status).toBe(201);
  });

  it("returns 409 when invite already pending", async () => {
    mockRequireRole.mockResolvedValue(director);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ errors: [{ code: "invitation_already_pending" }] }),
    }));
    const res = await POST(makeReq({ email: "already@invited.com", role: "technician" }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/already been sent/);
  });

  it("returns 409 when person already has an account", async () => {
    mockRequireRole.mockResolvedValue(director);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ errors: [{ code: "form_identifier_exists" }] }),
    }));
    const res = await POST(makeReq({ email: "existing@user.com", role: "technician" }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/already has an account/);
  });
});
