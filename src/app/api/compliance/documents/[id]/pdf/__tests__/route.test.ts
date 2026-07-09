import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/compliance/generatePdf", () => ({ generatePdf: vi.fn().mockResolvedValue(Buffer.from("pdf")) }));
vi.mock("@/lib/db/client", () => ({
  db: {
    complianceDocument: { findUnique: vi.fn() },
    assignment: { findFirst: vi.fn() },
    businessProfile: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET } from "../route";

const DOC_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "11111111-1111-4111-8111-111111111111";

const mockUser = { id: "u1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", phone: "", isActive: true };
const mockManager = { id: "u2", role: "director" as const, name: "Dana", clerkId: "c2", email: "d@t.com", phone: "", isActive: true };

const mockDoc = {
  id: DOC_ID,
  jobId: JOB_ID,
  template: { name: "SWMS", type: "swms" },
  job: { id: JOB_ID, customerName: "Rio Tinto", siteName: "Weipa" },
  createdBy: { name: "Jake" },
};

function makeReq() {
  return new Request(`http://localhost/api/compliance/documents/${DOC_ID}/pdf`);
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/compliance/documents/[id]/pdf", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(makeReq(), { params: { id: DOC_ID } });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the document is not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.complianceDocument.findUnique).mockResolvedValue(null);
    const res = await GET(makeReq(), { params: { id: DOC_ID } });
    expect(res.status).toBe(404);
  });

  it("returns the PDF for a non-technician role with no assignment check", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockManager as any);
    vi.mocked(db.complianceDocument.findUnique).mockResolvedValue(mockDoc as any);
    const res = await GET(makeReq(), { params: { id: DOC_ID } });
    expect(res.status).toBe(200);
    expect(db.assignment.findFirst).not.toHaveBeenCalled();
  });

  it("returns the PDF for a technician assigned to the document's job", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.complianceDocument.findUnique).mockResolvedValue(mockDoc as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);
    const res = await GET(makeReq(), { params: { id: DOC_ID } });
    expect(res.status).toBe(200);
    expect(db.assignment.findFirst).toHaveBeenCalledWith({ where: { userId: mockUser.id, jobId: JOB_ID } });
  });

  it("returns 403 when a technician is not assigned to the document's job", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.complianceDocument.findUnique).mockResolvedValue(mockDoc as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue(null);
    const res = await GET(makeReq(), { params: { id: DOC_ID } });
    expect(res.status).toBe(403);
  });
});
