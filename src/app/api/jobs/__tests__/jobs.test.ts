import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { update: vi.fn(), delete: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/customers/queries", () => ({ getCustomerById: vi.fn() }));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getCustomerById } from "@/lib/customers/queries";
import { DELETE, PATCH } from "../[id]/route";
import { POST } from "../route";

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

function makePostReq(body: unknown) {
  return new Request("http://localhost/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validPostBody = {
  customerName: "ACME Corp",
  siteName: "North Tower",
  siteAddress: "123 Main St, Sydney NSW 2000",
  quotedHours: 8,
  jobType: "Installation",
};

describe("POST /api/jobs", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makePostReq(validPostBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 when jobType is missing", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const { jobType: _, ...bodyWithoutJobType } = validPostBody;
    const res = await POST(makePostReq(bodyWithoutJobType));
    expect(res.status).toBe(400);
  });

  it("returns 400 when jobType is empty string", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const res = await POST(makePostReq({ ...validPostBody, jobType: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 when all fields including jobType are provided", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.create).mockResolvedValue({
      id: "j1",
      ...validPostBody,
      status: "scheduled",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    const res = await POST(makePostReq(validPostBody));
    expect(res.status).toBe(201);
  });

  it("returns 404 when customerId references unknown customer", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(getCustomerById).mockResolvedValue(null);
    const { customerName: _cn, ...bodyWithoutName } = validPostBody;
    const res = await POST(makePostReq({
      ...bodyWithoutName,
      customerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }));
    expect(res.status).toBe(404);
  });

  it("derives customerName from customer when customerId is provided", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(getCustomerById).mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "BHP",
    } as any);
    vi.mocked(db.job.create).mockResolvedValue({
      id: "j2",
      customerName: "BHP",
      customerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      siteName: "North Tower",
      siteAddress: "123 Main St, Sydney NSW 2000",
      quotedHours: 8,
      jobType: "Installation",
      status: "scheduled",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    const { customerName: _cn, ...bodyWithoutName } = validPostBody;
    const res = await POST(makePostReq({
      ...bodyWithoutName,
      customerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.customerName).toBe("BHP");
  });
});
