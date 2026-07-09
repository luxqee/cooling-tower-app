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
      delete:     vi.fn(),
      findUnique: vi.fn(),
    },
    complianceTemplate: { findUnique: vi.fn() },
    job:                { findUnique: vi.fn() },
    assignment:         { findMany: vi.fn(), findFirst: vi.fn() },
    businessProfile:    { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET as listDocs, POST as createDoc } from "../documents/route";
import { GET as getDoc } from "../documents/[id]/route";

const TMPL_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID  = "11111111-1111-4111-8111-111111111111";
const OTHER_JOB_ID = "55555555-5555-4555-8555-555555555555";
const DOC_ID  = "33333333-3333-4333-8333-333333333333";
const MISSING = "44444444-4444-4444-8444-444444444444";

const mockUser = { id: "u1", role: "technician" as const, name: "Jake", clerkId: "c1", email: "j@t.com", phone: "", isActive: true };
const mockManager = { id: "u2", role: "director" as const, name: "Dana", clerkId: "c2", email: "d@t.com", phone: "", isActive: true };

const mockTemplate = { id: TMPL_ID, name: "SWMS", type: "swms", sections: [], isActive: true, createdAt: new Date(), updatedAt: new Date() };
const mockJob      = { id: JOB_ID,  customerName: "Rio Tinto", siteName: "Weipa", siteAddress: "QLD", status: "active", quotedHours: 8, createdAt: new Date() };
const mockDoc      = { id: DOC_ID,  jobId: JOB_ID, templateId: TMPL_ID, createdById: "u1", values: {}, pdfUrl: null, submittedAt: new Date(), createdAt: new Date() };

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
    vi.mocked(db.assignment.findMany).mockResolvedValue([{ jobId: JOB_ID }] as any);
    vi.mocked(db.complianceDocument.findMany).mockResolvedValue([mockDoc] as any);
    const res = await listDocs();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
  });

  it("scopes the query to only the technician's assigned jobs", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.assignment.findMany).mockResolvedValue([{ jobId: JOB_ID }] as any);
    vi.mocked(db.complianceDocument.findMany).mockResolvedValue([mockDoc] as any);
    await listDocs();
    expect(db.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: mockUser.id } })
    );
    const callArg = vi.mocked(db.complianceDocument.findMany).mock.calls[0][0] as any;
    expect(callArg.where).toEqual({ jobId: { in: [JOB_ID] } });
  });

  it("does not scope the query for a non-technician role", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockManager as any);
    vi.mocked(db.complianceDocument.findMany).mockResolvedValue([mockDoc] as any);
    await listDocs();
    expect(db.assignment.findMany).not.toHaveBeenCalled();
    const callArg = vi.mocked(db.complianceDocument.findMany).mock.calls[0][0] as any;
    expect(callArg.where).toBeUndefined();
  });
});

describe("POST /api/compliance/documents", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await createDoc(makeReq({ jobId: JOB_ID, templateId: TMPL_ID, values: {} }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing required fields", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    const res = await createDoc(makeReq({ values: {} }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when template not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.complianceTemplate.findUnique).mockResolvedValue(null);
    const res = await createDoc(makeReq({ jobId: JOB_ID, templateId: MISSING, values: {} }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when job not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.complianceTemplate.findUnique).mockResolvedValue(mockTemplate as any);
    vi.mocked(db.job.findUnique).mockResolvedValue(null);
    const res = await createDoc(makeReq({ jobId: MISSING, templateId: TMPL_ID, values: {} }));
    expect(res.status).toBe(404);
  });

  it("creates document, generates PDF, returns 201 with pdfUrl set", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.complianceTemplate.findUnique).mockResolvedValue(mockTemplate as any);
    vi.mocked(db.job.findUnique).mockResolvedValue(mockJob as any);
    vi.mocked(db.complianceDocument.create).mockResolvedValue(mockDoc as any);
    vi.mocked(db.complianceDocument.update).mockResolvedValue({ ...mockDoc, pdfUrl: "https://blob.vercel-storage.com/compliance/doc-1.pdf" } as any);

    const res = await createDoc(makeReq({ jobId: JOB_ID, templateId: TMPL_ID, values: {} }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.pdfUrl).toBeTruthy();
  });
});

describe("GET /api/compliance/documents/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await getDoc(new Request(`http://localhost/api/compliance/documents/${DOC_ID}`), { params: { id: DOC_ID } });
    expect(res.status).toBe(401);
  });

  it("returns 200 with document when a technician is assigned to its job", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.complianceDocument.findUnique).mockResolvedValue(mockDoc as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue({ id: "a1" } as any);
    const res = await getDoc(new Request(`http://localhost/api/compliance/documents/${DOC_ID}`), { params: { id: DOC_ID } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(DOC_ID);
  });

  it("returns 200 with document for a non-technician role with no assignment check", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockManager as any);
    vi.mocked(db.complianceDocument.findUnique).mockResolvedValue(mockDoc as any);
    const res = await getDoc(new Request(`http://localhost/api/compliance/documents/${DOC_ID}`), { params: { id: DOC_ID } });
    expect(res.status).toBe(200);
    expect(db.assignment.findFirst).not.toHaveBeenCalled();
  });

  it("returns 403 when a technician is not assigned to the document's job", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.complianceDocument.findUnique).mockResolvedValue({ ...mockDoc, jobId: OTHER_JOB_ID } as any);
    vi.mocked(db.assignment.findFirst).mockResolvedValue(null);
    const res = await getDoc(new Request(`http://localhost/api/compliance/documents/${DOC_ID}`), { params: { id: DOC_ID } });
    expect(res.status).toBe(403);
  });

  it("returns 404 when document not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockUser as any);
    vi.mocked(db.complianceDocument.findUnique).mockResolvedValue(null);
    const res = await getDoc(new Request(`http://localhost/api/compliance/documents/${MISSING}`), { params: { id: MISSING } });
    expect(res.status).toBe(404);
  });
});
