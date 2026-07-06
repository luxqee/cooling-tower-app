import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { update: vi.fn(), delete: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { DELETE, PATCH } from "../[id]/route";

const mockDirector = { id: "d1", role: "director" as const, name: "Boss", clerkId: "c1", email: "b@c.com", isActive: true };

function makeDeleteReq(id: string) {
  return new Request(`http://localhost/api/jobs/${id}`, { method: "DELETE" });
}

beforeEach(() => vi.clearAllMocks());

describe("DELETE /api/jobs/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await DELETE(makeDeleteReq("job-1"), { params: { id: "job-1" } });
    expect(res.status).toBe(401);
  });

  it("returns 200 when job deleted successfully", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.delete).mockResolvedValue({} as any);
    const res = await DELETE(makeDeleteReq("job-1"), { params: { id: "job-1" } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("returns 409 when job has related records (FK violation P2003)", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.delete).mockRejectedValue(Object.assign(new Error("FK violation"), { code: "P2003" }));
    const res = await DELETE(makeDeleteReq("job-1"), { params: { id: "job-1" } });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/cannot delete/i);
  });

  it("returns 404 when job does not exist (P2025)", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.delete).mockRejectedValue(Object.assign(new Error("Not found"), { code: "P2025" }));
    const res = await DELETE(makeDeleteReq("job-1"), { params: { id: "job-1" } });
    expect(res.status).toBe(404);
  });
});
