import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    asset: { findUnique: vi.fn() },
    job: { findUnique: vi.fn() },
    jobAsset: { create: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET } from "../route";
import { POST as linkJob } from "../jobs/route";

const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const mockDirector = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };

function makeCtx() {
  return { params: { id: ASSET_ID } };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/assets/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(new Request("http://localhost/api/assets/x"), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns 404 when the asset does not exist", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.asset.findUnique).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/assets/x"), makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns the asset with its linked jobs (service history)", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.asset.findUnique).mockResolvedValue({
      id: ASSET_ID,
      serialNumber: "BAC-1",
      jobs: [{ job: { id: JOB_ID, siteName: "Weipa", status: "complete", createdAt: new Date() } }],
    } as any);
    const res = await GET(new Request("http://localhost/api/assets/x"), makeCtx());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jobs).toHaveLength(1);
  });
});

describe("POST /api/assets/[id]/jobs", () => {
  function makeReq(body: unknown) {
    return new Request("http://localhost/api/assets/x/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await linkJob(makeReq({ jobId: JOB_ID }), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns 400 when jobId is missing", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const res = await linkJob(makeReq({}), makeCtx());
    expect(res.status).toBe(400);
  });

  it("returns 404 when the job does not exist", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findUnique).mockResolvedValue(null);
    const res = await linkJob(makeReq({ jobId: JOB_ID }), makeCtx());
    expect(res.status).toBe(404);
  });

  it("returns 201 and links the job to the asset", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.findUnique).mockResolvedValue({ id: JOB_ID } as any);
    vi.mocked(db.jobAsset.create).mockResolvedValue({ jobId: JOB_ID, assetId: ASSET_ID } as any);
    const res = await linkJob(makeReq({ jobId: JOB_ID }), makeCtx());
    expect(res.status).toBe(201);
    expect(db.jobAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { jobId: JOB_ID, assetId: ASSET_ID } })
    );
  });
});
