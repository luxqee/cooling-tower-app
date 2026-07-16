import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));

import { requireRole } from "@/lib/auth/clerk";
import { POST } from "../route";

const DIRECTOR = { id: "d1", role: "director" as const, name: "Boss", clerkId: "c1", email: "d@c.com", isActive: true };

function makeReq(body?: unknown) {
  return new Request("http://localhost/api/team/invite", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

describe("POST /api/team/invite", () => {
  it("returns 401 for a non-director", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await POST(makeReq({ email: "new@example.com", role: "technician" }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid email", async () => {
    vi.mocked(requireRole).mockResolvedValue(DIRECTOR as any);
    const res = await POST(makeReq({ email: "not-an-email", role: "technician" }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid role", async () => {
    vi.mocked(requireRole).mockResolvedValue(DIRECTOR as any);
    const res = await POST(makeReq({ email: "new@example.com", role: "superadmin" }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the invite via the Clerk API for a director", async () => {
    vi.mocked(requireRole).mockResolvedValue(DIRECTOR as any);
    fetchMock.mockResolvedValue({ ok: true });

    const res = await POST(makeReq({ email: "new@example.com", role: "technician" }));

    expect(res.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.clerk.com/v1/invitations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual(expect.objectContaining({ email_address: "new@example.com", public_metadata: { role: "technician" } }));
  });

  it("returns 409 with a friendly message when Clerk reports a duplicate pending invite", async () => {
    vi.mocked(requireRole).mockResolvedValue(DIRECTOR as any);
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ errors: [{ code: "invitation_already_pending" }] }),
    });

    const res = await POST(makeReq({ email: "new@example.com", role: "technician" }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("already been sent");
  });

  it("returns 409 with a friendly message when the person already has an account", async () => {
    vi.mocked(requireRole).mockResolvedValue(DIRECTOR as any);
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ errors: [{ code: "form_identifier_exists" }] }),
    });

    const res = await POST(makeReq({ email: "existing@example.com", role: "technician" }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("already has an account");
  });

  it("returns 500 for an unrecognized Clerk error", async () => {
    vi.mocked(requireRole).mockResolvedValue(DIRECTOR as any);
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ errors: [{ code: "something_else" }] }) });

    const res = await POST(makeReq({ email: "new@example.com", role: "technician" }));
    expect(res.status).toBe(500);
  });

  it("returns 500 gracefully when Clerk's error response isn't valid JSON", async () => {
    vi.mocked(requireRole).mockResolvedValue(DIRECTOR as any);
    fetchMock.mockResolvedValue({ ok: false, json: async () => { throw new Error("not json"); } });

    const res = await POST(makeReq({ email: "new@example.com", role: "technician" }));
    expect(res.status).toBe(500);
  });
});
