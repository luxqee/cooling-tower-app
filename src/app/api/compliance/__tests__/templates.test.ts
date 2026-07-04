import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({
  requireRole: vi.fn(),
  getSessionUser: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
  db: {
    complianceTemplate: {
      findMany:   vi.fn(),
      findUnique: vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
    },
  },
}));

import { requireRole, getSessionUser } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET as listTemplates, POST as createTemplate } from "../templates/route";
import { GET as getTemplate, PATCH as updateTemplate, DELETE as deleteTemplate } from "../templates/[id]/route";

const mockRequireRole    = vi.mocked(requireRole);
const mockGetSessionUser = vi.mocked(getSessionUser);

const mockAdmin  = { id: "u1", role: "admin"      as const, name: "Admin",      clerkId: "c1", email: "a@t.com", phone: "", isActive: true };
const mockEditor = { id: "u2", role: "technician" as const, name: "Technician", clerkId: "c2", email: "t@t.com", phone: "", isActive: true };

const mockTemplate = {
  id: "tmpl-1", name: "SWMS", type: "swms",
  sections: [], isActive: true,
  createdAt: new Date(), updatedAt: new Date(),
};

function makeReq(body?: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/compliance/templates", () => {
  it("returns active templates for any authenticated user", async () => {
    mockGetSessionUser.mockResolvedValue(mockEditor as any);
    vi.mocked(db.complianceTemplate.findMany).mockResolvedValue([mockTemplate] as any);
    const res = await listTemplates();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const res = await listTemplates();
    expect(res.status).toBe(401);
  });
});

describe("POST /api/compliance/templates", () => {
  it("returns 401 for non-admin", async () => {
    mockRequireRole.mockRejectedValue(new Error("Forbidden"));
    const res = await createTemplate(makeReq({ name: "X", type: "swms", sections: [] }));
    expect(res.status).toBe(401);
  });

  it("creates a template for admin", async () => {
    mockRequireRole.mockResolvedValue(mockAdmin as any);
    vi.mocked(db.complianceTemplate.create).mockResolvedValue(mockTemplate as any);
    const res = await createTemplate(makeReq({ name: "SWMS", type: "swms", sections: [{ title: "Section 1" }] }));
    expect(res.status).toBe(201);
  });

  it("returns 400 for missing name", async () => {
    mockRequireRole.mockResolvedValue(mockAdmin as any);
    const res = await createTemplate(makeReq({ type: "swms", sections: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty sections array", async () => {
    mockRequireRole.mockResolvedValue(mockAdmin as any);
    const res = await createTemplate(makeReq({ name: "SWMS", type: "swms", sections: [] }));
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/compliance/templates/[id]", () => {
  it("returns 401 for non-admin", async () => {
    mockRequireRole.mockRejectedValue(new Error("Forbidden"));
    const res = await updateTemplate(
      new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Updated" }) }),
      { params: { id: "tmpl-1" } }
    );
    expect(res.status).toBe(401);
  });

  it("updates template for admin", async () => {
    mockRequireRole.mockResolvedValue(mockAdmin as any);
    vi.mocked(db.complianceTemplate.findUnique).mockResolvedValue(mockTemplate as any);
    vi.mocked(db.complianceTemplate.update).mockResolvedValue({ ...mockTemplate, name: "Updated" } as any);
    const res = await updateTemplate(
      new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Updated" }) }),
      { params: { id: "tmpl-1" } }
    );
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/compliance/templates/[id]", () => {
  it("soft-deletes for admin", async () => {
    mockRequireRole.mockResolvedValue(mockAdmin as any);
    vi.mocked(db.complianceTemplate.findUnique).mockResolvedValue(mockTemplate as any);
    vi.mocked(db.complianceTemplate.update).mockResolvedValue({ ...mockTemplate, isActive: false } as any);
    const res = await deleteTemplate(
      new Request("http://localhost", { method: "DELETE" }),
      { params: { id: "tmpl-1" } }
    );
    expect(res.status).toBe(200);
  });

  it("soft-deleted template does not appear in GET list", async () => {
    mockRequireRole.mockResolvedValue(mockAdmin as any);
    mockGetSessionUser.mockResolvedValue(mockAdmin as any);
    vi.mocked(db.complianceTemplate.findUnique).mockResolvedValue(mockTemplate as any);
    vi.mocked(db.complianceTemplate.update).mockResolvedValue({ ...mockTemplate, isActive: false } as any);
    vi.mocked(db.complianceTemplate.findMany).mockResolvedValue([]);

    await deleteTemplate(
      new Request("http://localhost", { method: "DELETE" }),
      { params: { id: "tmpl-1" } }
    );

    const listRes = await listTemplates();
    const data = await listRes.json();
    expect(data.find((t: any) => t.id === "tmpl-1")).toBeUndefined();
  });

  it("returns 401 when caller is not admin", async () => {
    mockRequireRole.mockRejectedValue(new Error("Forbidden"));
    const res = await deleteTemplate(
      new Request("http://localhost", { method: "DELETE" }),
      { params: { id: "tmpl-1" } }
    );
    expect(res.status).toBe(401);
  });
});
