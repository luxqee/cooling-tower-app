import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk",        () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/compliance/generatePdf", () => ({ generatePdf: vi.fn().mockResolvedValue(Buffer.from("pdf")) }));
vi.mock("@vercel/blob",            () => ({ put: vi.fn().mockResolvedValue({ url: "https://blob.vercel-storage.com/compliance/doc-1.pdf" }) }));
vi.mock("@/lib/db/client", () => ({
  db: {
    complianceDocument: {
      findMany:   vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      findUnique: vi.fn(),
    },
    complianceTemplate: { findUnique: vi.fn() },
    job:               { findUnique: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET as listDocs, POST as createDoc } from "../documents/route";
import { GET as getDoc } from "../documents/[id]/route";

const mockUser = { id: "u1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", phone: "", isActive: true };

const mockTemplate = { id: "tmpl-1", name: "SWMS", type: "swms", sections: [], isActive: true, createdAt: new Date(), updatedAt: new Date() };
const mockJob      = { id: "job-1",  customerName: "Rio Tinto", siteName: "Weipa", siteAddress: "QLD", status: "active", quotedHours: 8, createdAt: new Date() };
const mockDoc      = { id: "doc-1",  jobId: "job-1", templateId: "tmpl-1", createdById: "u1", values: {}, pdfUrl: null, submittedAt: new Date(), createdAt: new Date() };

function makeReq(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/compliance/documents", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await listDocs();
    expect(res.status).toBe(401);
  });

  it("returns document list", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.complianceDocument.findMany).mockResolvedValue([mockDoc] as any);
    const res = await listDocs();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
  });
});

describe("POST /api/compliance/documents", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await createDoc(makeReq({ jobId: "job-1", templateId: "tmpl-1", values: {} }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when template not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.complianceTemplate.findUnique).mockResolvedValue(null);
    const res = await createDoc(makeReq({ jobId: "job-1", templateId: "missing", values: {} }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when job not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.complianceTemplate.findUnique).mockResolvedValue(mockTemplate as any);
    vi.mocked(db.job.findUnique).mockResolvedValue(null);
    const res = await createDoc(makeReq({ jobId: "missing", templateId: "tmpl-1", values: {} }));
    expect(res.status).toBe(404);
  });

  it("creates document, generates PDF, returns 201 with pdfUrl set", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.complianceTemplate.findUnique).mockResolvedValue(mockTemplate as any);
    vi.mocked(db.job.findUnique).mockResolvedValue(mockJob as any);
    vi.mocked(db.complianceDocument.create).mockResolvedValue(mockDoc as any);
    vi.mocked(db.complianceDocument.update).mockResolvedValue({ ...mockDoc, pdfUrl: "https://blob.vercel-storage.com/compliance/doc-1.pdf" } as any);

    const res = await createDoc(makeReq({ jobId: "job-1", templateId: "tmpl-1", values: {} }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.pdfUrl).toBeTruthy();
  });
});
