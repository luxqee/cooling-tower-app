# Phase 2a — Compliance Document Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let all users fill in SWMS, JSA, and WHS compliance document templates on their phone, with PDFs generated server-side and stored in Vercel Blob. Admins configure section-based templates via an in-app builder.

**Architecture:** Section-based templates stored as JSON in Postgres. Users fill in a multi-step form; the server generates a PDF with `@react-pdf/renderer`, uploads it to Vercel Blob (private), and stores the URL on the document record. PDFs are served via the existing `/api/photos?url=` authenticated proxy.

**Tech Stack:** Next.js 14 App Router · TypeScript · Prisma 7 + Neon · Clerk · `@react-pdf/renderer` · Vercel Blob · Tailwind CSS · Vitest

## Global Constraints

- All PDFs stored with `access: "private"` — served only via `/api/photos?url=` proxy
- PDF generation in a Node.js runtime API route — do NOT use edge runtime
- Documents retained indefinitely (7-year Australian WHS compliance requirement)
- Deleted templates are soft-deleted only — existing documents remain renderable
- Field types: `text` | `textarea` | `date` | `checkbox` | `checklist` | `signature`
- Only `admin` role can create/edit/delete templates; all other roles are read-only on templates

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `prisma/schema.prisma` | Add `ComplianceTemplate`, `ComplianceDocument` models |
| Create | `src/lib/compliance/types.ts` | Shared TS types for sections/fields/values JSON |
| Create | `src/lib/compliance/generatePdf.ts` | `generatePdf()` — renders PDF buffer from document + template |
| Create | `src/lib/compliance/__tests__/pdf.test.ts` | Unit tests for PDF generation |
| Create | `src/app/api/compliance/templates/route.ts` | GET list, POST create |
| Create | `src/app/api/compliance/templates/[id]/route.ts` | GET one, PATCH update, DELETE soft-delete |
| Create | `src/app/api/compliance/documents/route.ts` | GET list, POST submit+generate |
| Create | `src/app/api/compliance/documents/[id]/route.ts` | GET one |
| Create | `src/app/api/compliance/__tests__/templates.test.ts` | Unit tests for template API |
| Create | `src/app/api/compliance/__tests__/documents.test.ts` | Unit tests for document API |
| Modify | `src/lib/nav-config.ts` | Add Compliance + Templates nav items |
| Create | `src/app/compliance/page.tsx` | Document list (all roles) |
| Create | `src/app/compliance/new/page.tsx` | Server shell — fetches jobs + templates |
| Create | `src/app/compliance/new/SignatureCanvas.tsx` | Canvas signature capture (client) |
| Create | `src/app/compliance/new/ComplianceForm.tsx` | Multi-step fill-in form (client) |
| Create | `src/app/compliance/templates/page.tsx` | Template list (admin only) |
| Create | `src/app/compliance/templates/TemplateBuilder.tsx` | Section/field editor (client) |
| Create | `src/app/compliance/templates/new/page.tsx` | New template page (admin) |
| Create | `src/app/compliance/templates/[id]/edit/page.tsx` | Edit template page (admin) |

---

## Task 1: Install dependencies and shared types

**Files:**
- Modify: `package.json`
- Create: `src/lib/compliance/types.ts`

**Interfaces:**
- Produces: `TemplateField`, `TemplateSection`, `TemplateSections`, `DocumentValues` — used by every subsequent task

- [ ] **Step 1: Install `@react-pdf/renderer`**

```bash
pnpm add @react-pdf/renderer
pnpm add -D @types/react-pdf
```

- [ ] **Step 2: Verify install**

```bash
pnpm list @react-pdf/renderer
```

Expected: `@react-pdf/renderer` listed with a version number.

- [ ] **Step 3: Create shared types**

Create `src/lib/compliance/types.ts`:

```typescript
export type FieldType = "text" | "textarea" | "date" | "checkbox" | "checklist" | "signature";

export interface TemplateField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[]; // only used when type === "checklist"
}

export interface TemplateSection {
  id: string;
  title: string;
  fields: TemplateField[];
}

export type TemplateSections = TemplateSection[];

// fieldId → string | boolean | string[] (for checklist) | null
export type DocumentValues = Record<string, string | boolean | string[] | null>;
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/compliance/types.ts
git commit -m "chore: add @react-pdf/renderer and compliance shared types"
```

---

## Task 2: Prisma schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/` (auto-generated)

**Interfaces:**
- Produces: `ComplianceTemplate` and `ComplianceDocument` Prisma models used by all API routes

- [ ] **Step 1: Add models to `prisma/schema.prisma`**

Add the following two models at the end of `prisma/schema.prisma`:

```prisma
model ComplianceTemplate {
  id        String   @id @default(uuid())
  name      String
  type      String
  sections  Json
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  documents ComplianceDocument[]

  @@index([isActive])
}

model ComplianceDocument {
  id          String   @id @default(uuid())
  jobId       String
  templateId  String
  createdById String
  values      Json
  pdfUrl      String?
  submittedAt DateTime @default(now())
  createdAt   DateTime @default(now())

  job       Job                @relation(fields: [jobId], references: [id])
  template  ComplianceTemplate @relation(fields: [templateId], references: [id])
  createdBy User               @relation("ComplianceDocuments", fields: [createdById], references: [id])

  @@index([jobId])
  @@index([createdById])
}
```

- [ ] **Step 2: Add relation fields to `User` and `Job` models**

In `prisma/schema.prisma`, add to the `User` model's relation block:

```prisma
complianceDocuments ComplianceDocument[] @relation("ComplianceDocuments")
```

Add to the `Job` model's relation block:

```prisma
complianceDocuments ComplianceDocument[]
```

- [ ] **Step 3: Run migration**

```bash
pnpm dlx prisma migrate dev --name add_compliance_tables
```

Expected output contains: `Your database is now in sync with your schema.`

- [ ] **Step 4: Verify Prisma client regenerated**

```bash
pnpm dlx prisma generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 5: Verify TypeScript sees the new models**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: no errors mentioning `ComplianceTemplate` or `ComplianceDocument`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add ComplianceTemplate and ComplianceDocument prisma models"
```

---

## Task 3: PDF generation function (TDD)

**Files:**
- Create: `src/lib/compliance/__tests__/pdf.test.ts`
- Create: `src/lib/compliance/generatePdf.ts`

**Interfaces:**
- Consumes: `TemplateSections`, `DocumentValues` from `src/lib/compliance/types.ts`
- Produces: `generatePdf(args: GeneratePdfArgs): Promise<Buffer>` — used by `POST /api/compliance/documents`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/compliance/__tests__/pdf.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-pdf-content")),
  Document: ({ children }: any) => children,
  Page: ({ children }: any) => children,
  View: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Image: () => null,
  StyleSheet: { create: (s: any) => s },
}));

import { generatePdf } from "../generatePdf";

const baseTemplate = {
  id: "tmpl-1",
  name: "Standard SWMS",
  type: "swms",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  sections: [
    {
      id: "sec-1",
      title: "Project Details",
      fields: [
        { id: "f-text",      label: "Contractor",      type: "text",      required: true  },
        { id: "f-textarea",  label: "Description",     type: "textarea",  required: false },
        { id: "f-date",      label: "Start Date",      type: "date",      required: false },
        { id: "f-checkbox",  label: "PPE Required",    type: "checkbox",  required: false },
        { id: "f-checklist", label: "Safety Checks",   type: "checklist", required: false, options: ["Harness", "Helmet"] },
        { id: "f-sig",       label: "Signature",       type: "signature", required: true  },
      ],
    },
  ],
};

const baseDocument = {
  id: "doc-1",
  jobId: "job-1",
  templateId: "tmpl-1",
  createdById: "user-1",
  pdfUrl: null,
  submittedAt: new Date("2026-07-04T10:00:00Z"),
  createdAt: new Date("2026-07-04T10:00:00Z"),
  values: {
    "f-text":      "Cooling Tower Services",
    "f-textarea":  "Replace fill media on unit 3",
    "f-date":      "2026-07-04",
    "f-checkbox":  true,
    "f-checklist": ["Harness", "Helmet"],
    "f-sig":       "data:image/png;base64,iVBORw0KGgo=",
  },
};

const baseJob  = { id: "job-1", customerName: "Rio Tinto", siteName: "Weipa Site A", siteAddress: "Weipa QLD", status: "active", quotedHours: 8, createdAt: new Date() };
const baseUser = { id: "user-1", name: "Jake Torres", clerkId: "c1", email: "j@t.com", phone: "", role: "technician", isActive: true, createdAt: new Date() };

beforeEach(() => vi.clearAllMocks());

describe("generatePdf", () => {
  it("returns a Buffer for a complete document", async () => {
    const result = await generatePdf({ document: baseDocument as any, template: baseTemplate as any, job: baseJob as any, createdBy: baseUser as any });
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("does not throw when all field values are missing", async () => {
    const emptyDoc = { ...baseDocument, values: {} };
    await expect(
      generatePdf({ document: emptyDoc as any, template: baseTemplate as any, job: baseJob as any, createdBy: baseUser as any })
    ).resolves.not.toThrow();
  });

  it("calls renderToBuffer once", async () => {
    const { renderToBuffer } = await import("@react-pdf/renderer");
    await generatePdf({ document: baseDocument as any, template: baseTemplate as any, job: baseJob as any, createdBy: baseUser as any });
    expect(renderToBuffer).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests ��� confirm they fail**

```bash
pnpm test src/lib/compliance/__tests__/pdf.test.ts
```

Expected: FAIL — `Cannot find module '../generatePdf'`

- [ ] **Step 3: Implement `generatePdf`**

Create `src/lib/compliance/generatePdf.ts`:

```typescript
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import type { ComplianceDocument, ComplianceTemplate, Job, User } from "@prisma/client";
import type { TemplateSections, DocumentValues } from "./types";

const styles = StyleSheet.create({
  page:          { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  header:        { marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  typeBadge:     { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#ffffff", backgroundColor: "#f59e0b", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, marginBottom: 6, alignSelf: "flex-start", textTransform: "uppercase" },
  docTitle:      { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  headerMeta:    { fontSize: 9, color: "#64748b", marginTop: 2 },
  section:       { marginBottom: 16 },
  sectionTitle:  { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, paddingBottom: 3, borderBottomWidth: 0.5, borderBottomColor: "#cbd5e1" },
  fieldRow:      { flexDirection: "row", marginBottom: 5, minHeight: 16 },
  fieldLabel:    { width: "35%", fontFamily: "Helvetica-Bold", color: "#475569", paddingRight: 8 },
  fieldValue:    { width: "65%", color: "#1e293b" },
  signatureImage:{ width: 160, height: 60, marginTop: 2 },
  footer:        { position: "absolute", bottom: 20, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#94a3b8", borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 6 },
});

interface GeneratePdfArgs {
  document: ComplianceDocument;
  template: ComplianceTemplate;
  job: Job;
  createdBy: User;
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-AU"); } catch { return iso; }
}

function FieldValue({ type, value }: { type: string; value: unknown }) {
  if (value == null || value === "") return createElement(Text, { style: styles.fieldValue }, "—");

  if (type === "signature" && typeof value === "string" && value.startsWith("data:image/")) {
    return createElement(Image, { src: value, style: styles.signatureImage });
  }
  if (type === "checkbox") {
    return createElement(Text, { style: styles.fieldValue }, value ? "☑ Yes" : "☐ No");
  }
  if (type === "checklist" && Array.isArray(value)) {
    return createElement(Text, { style: styles.fieldValue }, value.length ? value.join(", ") : "None selected");
  }
  if (type === "date" && typeof value === "string") {
    return createElement(Text, { style: styles.fieldValue }, formatDate(value));
  }
  return createElement(Text, { style: styles.fieldValue }, String(value));
}

export async function generatePdf({ document, template, job, createdBy }: GeneratePdfArgs): Promise<Buffer> {
  const sections = template.sections as unknown as TemplateSections;
  const values   = (document.values ?? {}) as DocumentValues;

  const docElement = createElement(
    Document,
    null,
    createElement(
      Page,
      { size: "A4", style: styles.page },
      // Header
      createElement(
        View,
        { style: styles.header },
        createElement(Text, { style: styles.typeBadge }, template.type.toUpperCase()),
        createElement(Text, { style: styles.docTitle }, template.name),
        createElement(Text, { style: styles.headerMeta }, `Job: ${job.customerName} — ${job.siteName}`),
        createElement(Text, { style: styles.headerMeta }, `Submitted by: ${createdBy.name}`),
        createElement(Text, { style: styles.headerMeta }, `Date: ${new Date(document.submittedAt).toLocaleDateString("en-AU")}`),
      ),
      // Sections
      ...sections.map((section) =>
        createElement(
          View,
          { key: section.id, style: styles.section },
          createElement(Text, { style: styles.sectionTitle }, section.title),
          ...section.fields.map((field) =>
            createElement(
              View,
              { key: field.id, style: styles.fieldRow },
              createElement(Text, { style: styles.fieldLabel }, field.label),
              createElement(FieldValue, { type: field.type, value: values[field.id] ?? null }),
            )
          ),
        )
      ),
      // Footer
      createElement(
        Text,
        { style: styles.footer, fixed: true },
        `Generated by CT Field Ops · ${new Date().toLocaleString("en-AU")}`
      ),
    )
  );

  return renderToBuffer(docElement) as Promise<Buffer>;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm test src/lib/compliance/__tests__/pdf.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compliance/generatePdf.ts src/lib/compliance/__tests__/pdf.test.ts
git commit -m "feat: pdf generation for compliance documents — tested"
```

---

## Task 4: Template API routes (TDD)

**Files:**
- Create: `src/app/api/compliance/__tests__/templates.test.ts`
- Create: `src/app/api/compliance/templates/route.ts`
- Create: `src/app/api/compliance/templates/[id]/route.ts`

**Interfaces:**
- Consumes: `requireRole` from `@/lib/auth/clerk`, `db` from `@/lib/db/client`
- Produces: REST endpoints consumed by `TemplateBuilder` and `ComplianceForm`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/compliance/__tests__/templates.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    complianceTemplate: {
      findMany:  vi.fn(),
      findUnique: vi.fn(),
      create:    vi.fn(),
      update:    vi.fn(),
    },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET as listTemplates, POST as createTemplate } from "../templates/route";
import { GET as getTemplate, PATCH as updateTemplate, DELETE as deleteTemplate } from "../templates/[id]/route";

const mockAdmin  = { id: "u1", role: "admin"     as const, name: "Admin",     clerkId: "c1", email: "a@t.com", phone: "", isActive: true };
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
    vi.mocked(requireRole).mockResolvedValue(mockEditor as any);
    vi.mocked(db.complianceTemplate.findMany).mockResolvedValue([mockTemplate] as any);
    const res = await listTemplates();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await listTemplates();
    expect(res.status).toBe(401);
  });
});

describe("POST /api/compliance/templates", () => {
  it("returns 401 for non-admin", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await createTemplate(makeReq({ name: "X", type: "swms", sections: [] }));
    expect(res.status).toBe(401);
  });

  it("creates a template for admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockAdmin as any);
    vi.mocked(db.complianceTemplate.create).mockResolvedValue(mockTemplate as any);
    const res = await createTemplate(makeReq({ name: "SWMS", type: "swms", sections: [] }));
    expect(res.status).toBe(201);
  });

  it("returns 400 for missing name", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockAdmin as any);
    const res = await createTemplate(makeReq({ type: "swms", sections: [] }));
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/compliance/templates/[id]", () => {
  it("returns 401 for non-admin", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await updateTemplate(
      new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Updated" }) }),
      { params: { id: "tmpl-1" } }
    );
    expect(res.status).toBe(401);
  });

  it("updates template for admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockAdmin as any);
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
    vi.mocked(requireRole).mockResolvedValue(mockAdmin as any);
    vi.mocked(db.complianceTemplate.findUnique).mockResolvedValue(mockTemplate as any);
    vi.mocked(db.complianceTemplate.update).mockResolvedValue({ ...mockTemplate, isActive: false } as any);
    const res = await deleteTemplate(
      new Request("http://localhost", { method: "DELETE" }),
      { params: { id: "tmpl-1" } }
    );
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm test src/app/api/compliance/__tests__/templates.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/app/api/compliance/templates/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const templateSchema = z.object({
  name:     z.string().min(1, "Name is required"),
  type:     z.enum(["swms", "jsa", "whs"]),
  sections: z.array(z.any()).default([]),
});

export async function GET() {
  const user = await requireRole(["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await db.complianceTemplate.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(templates);
}

export async function POST(req: Request) {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = templateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const template = await db.complianceTemplate.create({ data: parsed.data });
  return NextResponse.json(template, { status: 201 });
}
```

- [ ] **Step 4: Create `src/app/api/compliance/templates/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const updateSchema = z.object({
  name:     z.string().min(1).optional(),
  type:     z.enum(["swms", "jsa", "whs"]).optional(),
  sections: z.array(z.any()).optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const template = await db.complianceTemplate.findUnique({ where: { id: params.id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(template);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await db.complianceTemplate.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const updated = await db.complianceTemplate.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await db.complianceTemplate.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.complianceTemplate.update({ where: { id: params.id }, data: { isActive: false } });
  return NextResponse.json(updated);
}
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
pnpm test src/app/api/compliance/__tests__/templates.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/compliance/templates/ src/app/api/compliance/__tests__/templates.test.ts
git commit -m "feat: compliance template API routes — tested"
```

---

## Task 5: Document API routes (TDD)

**Files:**
- Create: `src/app/api/compliance/__tests__/documents.test.ts`
- Create: `src/app/api/compliance/documents/route.ts`
- Create: `src/app/api/compliance/documents/[id]/route.ts`

**Interfaces:**
- Consumes: `generatePdf` from `@/lib/compliance/generatePdf`, `put` from `@vercel/blob`
- Produces: `GET /api/compliance/documents`, `POST /api/compliance/documents`, `GET /api/compliance/documents/[id]`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/compliance/__tests__/documents.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm test src/app/api/compliance/__tests__/documents.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/app/api/compliance/documents/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { generatePdf } from "@/lib/compliance/generatePdf";

export async function GET() {
  const user = await requireRole(["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const docs = await db.complianceDocument.findMany({
    include: {
      template:  { select: { name: true, type: true } },
      job:       { select: { customerName: true, siteName: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return NextResponse.json(docs);
}

export async function POST(req: Request) {
  const user = await requireRole(["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId, templateId, values } = await req.json();

  const template = await db.complianceTemplate.findUnique({ where: { id: templateId, isActive: true } });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const document = await db.complianceDocument.create({
    data: { jobId, templateId, createdById: user.id, values: values ?? {} },
  });

  const pdfBuffer = await generatePdf({ document, template, job, createdBy: { ...user, phone: "", createdAt: new Date() } as any });
  const blob = await put(`compliance/${document.id}.pdf`, pdfBuffer, { access: "private", contentType: "application/pdf" });

  const updated = await db.complianceDocument.update({
    where: { id: document.id },
    data:  { pdfUrl: blob.url },
    include: {
      template:  { select: { name: true, type: true } },
      job:       { select: { customerName: true, siteName: true } },
      createdBy: { select: { name: true } },
    },
  });

  return NextResponse.json(updated, { status: 201 });
}
```

- [ ] **Step 4: Create `src/app/api/compliance/documents/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await db.complianceDocument.findUnique({
    where: { id: params.id },
    include: {
      template:  true,
      job:       { select: { customerName: true, siteName: true } },
      createdBy: { select: { name: true } },
    },
  });

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(doc);
}
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
pnpm test src/app/api/compliance/__tests__/documents.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Run all tests**

```bash
pnpm test
```

Expected: all 30+ tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/compliance/documents/ src/app/api/compliance/__tests__/documents.test.ts
git commit -m "feat: compliance document API routes — tested"
```

---

## Task 6: Nav config update

**Files:**
- Modify: `src/lib/nav-config.ts`

**Interfaces:**
- Consumes: `ShieldCheck`, `FileText` icons from `lucide-react`
- Produces: Compliance + Templates nav items visible to all/admin

- [ ] **Step 1: Update `src/lib/nav-config.ts`**

Add `ShieldCheck` and `FileText` to the import line at the top:

```typescript
import {
  LayoutDashboard,
  Briefcase,
  Clock,
  FileEdit,
  Calendar,
  Users,
  ShieldCheck,
  FileText,
  type LucideIcon,
} from "lucide-react";
```

Add to the `navItems` array (after the existing items):

```typescript
  {
    label: "Compliance",
    href: "/compliance",
    icon: ShieldCheck,
    description: "SWMS, JSA, and WHS compliance documents",
    visibleTo: ["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"],
    phase: "2",
  },
  {
    label: "Templates",
    href: "/compliance/templates",
    icon: FileText,
    description: "Manage compliance document templates",
    visibleTo: ["admin"],
    phase: "2",
  },
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm tsc --noEmit 2>&1 | grep nav-config
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/nav-config.ts
git commit -m "feat: add Compliance and Templates nav items"
```

---

## Task 7: Document list page

**Files:**
- Create: `src/app/compliance/page.tsx`

**Interfaces:**
- Consumes: `AppShell`, `requireRole`, `db`
- Produces: `/compliance` page — lists all documents, links to PDF, "New document" button

- [ ] **Step 1: Create `src/app/compliance/page.tsx`**

```typescript
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import Link from "next/link";

const TYPE_LABELS: Record<string, string> = { swms: "SWMS", jsa: "JSA", whs: "WHS" };
const TYPE_COLOURS: Record<string, string> = {
  swms: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  jsa:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  whs:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

export default async function CompliancePage() {
  const user = await requireRole(["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"]).catch(() => null);
  if (!user) redirect("/sign-in");

  const docs = await db.complianceDocument.findMany({
    include: {
      template:  { select: { name: true, type: true } },
      job:       { select: { customerName: true, siteName: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Compliance Documents</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">SWMS, JSA, and WHS records</p>
          </div>
          <div className="flex items-center gap-3">
            {user.role === "admin" && (
              <Link href="/compliance/templates" className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 underline underline-offset-2">
                Manage templates
              </Link>
            )}
            <Link href="/compliance/new" className="min-h-[40px] px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm flex items-center">
              New document
            </Link>
          </div>
        </div>

        {docs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">No compliance documents yet.</p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div key={doc.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLOURS[doc.template.type] ?? ""}`}>
                        {TYPE_LABELS[doc.template.type] ?? doc.template.type}
                      </span>
                      <p className="font-medium truncate">{doc.template.name}</p>
                    </div>
                    <p className="text-sm text-slate-500 truncate">{doc.job.customerName} — {doc.job.siteName}</p>
                    <p className="text-xs text-slate-400">
                      {doc.createdBy.name} · {new Date(doc.submittedAt).toLocaleDateString("en-AU")}
                    </p>
                  </div>
                  {doc.pdfUrl && (
                    <a
                      href={`/api/photos?url=${encodeURIComponent(doc.pdfUrl)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-sm text-amber-600 hover:text-amber-700 underline underline-offset-2"
                    >
                      View PDF
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/compliance/page.tsx
git commit -m "feat: compliance document list page"
```

---

## Task 8: SignatureCanvas component

**Files:**
- Create: `src/app/compliance/new/SignatureCanvas.tsx`

**Interfaces:**
- Produces: `<SignatureCanvas onChange={(dataUrl: string | null) => void} />` — used by `ComplianceForm`

- [ ] **Step 1: Create `src/app/compliance/new/SignatureCanvas.tsx`**

```typescript
"use client";

import { useRef, useEffect, useState } from "react";

interface SignatureCanvasProps {
  onChange: (dataUrl: string | null) => void;
}

export function SignatureCanvas({ onChange }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing   = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth   = 2;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
  }, []);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    setIsEmpty(false);
    onChange(canvasRef.current?.toDataURL("image/png") ?? null);
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onChange(null);
  }

  return (
    <div className="space-y-1">
      <div className="relative rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 overflow-hidden touch-none"
           style={{ height: 100 }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={150}
          className="w-full h-full"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {isEmpty && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 pointer-events-none select-none">
            Sign here
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline underline-offset-2"
      >
        Clear
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/compliance/new/SignatureCanvas.tsx
git commit -m "feat: signature canvas component for compliance forms"
```

---

## Task 9: ComplianceForm — multi-step fill-in

**Files:**
- Create: `src/app/compliance/new/ComplianceForm.tsx`

**Interfaces:**
- Consumes: `SignatureCanvas` from `./SignatureCanvas`
- Produces: `<ComplianceForm jobs={...} templates={...} />` — used by `/compliance/new/page.tsx`

- [ ] **Step 1: Create `src/app/compliance/new/ComplianceForm.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SignatureCanvas } from "./SignatureCanvas";
import type { TemplateSections, DocumentValues } from "@/lib/compliance/types";

interface Job      { id: string; customerName: string; siteName: string; }
interface Template { id: string; name: string; type: string; sections: unknown; }

interface ComplianceFormProps {
  jobs:      Job[];
  templates: Template[];
}

type Step = "job" | "template" | "form";

const TYPE_LABELS: Record<string, string>  = { swms: "SWMS", jsa: "JSA", whs: "WHS" };
const TYPE_COLOURS: Record<string, string> = {
  swms: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  jsa:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  whs:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

export function ComplianceForm({ jobs, templates }: ComplianceFormProps) {
  const router = useRouter();
  const [step, setStep]               = useState<Step>("job");
  const [jobId, setJobId]             = useState("");
  const [template, setTemplate]       = useState<Template | null>(null);
  const [values, setValues]           = useState<DocumentValues>({});
  const [error, setError]             = useState<string | null>(null);
  const [isPending, startTransition]  = useTransition();

  function setValue(fieldId: string, value: DocumentValues[string]) {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  function submit() {
    if (!template || !jobId) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/compliance/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, templateId: template.id, values }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to submit. Please try again.");
        return;
      }
      router.push("/compliance");
      router.refresh();
    });
  }

  // Step 1 — pick job
  if (step === "job") {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Select job</label>
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm"
          >
            <option value="">— Choose a job —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.customerName} — {j.siteName}</option>
            ))}
          </select>
        </div>
        <button
          disabled={!jobId}
          onClick={() => setStep("template")}
          className="w-full min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>
    );
  }

  // Step 2 — pick template
  if (step === "template") {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium">Select document type</p>
        <div className="space-y-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTemplate(t); setValues({}); setStep("form"); }}
              className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 hover:border-amber-400 dark:hover:border-amber-500 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLOURS[t.type] ?? ""}`}>
                  {TYPE_LABELS[t.type] ?? t.type}
                </span>
                <span className="font-medium">{t.name}</span>
              </div>
            </button>
          ))}
        </div>
        <button
          onClick={() => setStep("job")}
          className="text-sm text-slate-500 underline underline-offset-2"
        >
          ← Back
        </button>
      </div>
    );
  }

  // Step 3 — fill in form
  const sections = (template?.sections ?? []) as TemplateSections;

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.id} className="space-y-3">
          <h3 className="font-semibold text-sm border-b border-slate-200 dark:border-slate-700 pb-2">{section.title}</h3>
          {section.fields.map((field) => (
            <div key={field.id} className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>

              {field.type === "text" && (
                <input
                  type="text"
                  value={(values[field.id] as string) ?? ""}
                  onChange={(e) => setValue(field.id, e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm"
                />
              )}

              {field.type === "textarea" && (
                <textarea
                  value={(values[field.id] as string) ?? ""}
                  onChange={(e) => setValue(field.id, e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm resize-none"
                />
              )}

              {field.type === "date" && (
                <input
                  type="date"
                  value={(values[field.id] as string) ?? ""}
                  onChange={(e) => setValue(field.id, e.target.value)}
                  className="w-full min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm"
                />
              )}

              {field.type === "checkbox" && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(values[field.id] as boolean) ?? false}
                    onChange={(e) => setValue(field.id, e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                  <span className="text-sm">Yes</span>
                </label>
              )}

              {field.type === "checklist" && (
                <div className="space-y-1">
                  {(field.options ?? []).map((opt) => {
                    const checked = ((values[field.id] as string[]) ?? []).includes(opt);
                    return (
                      <label key={opt} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const current = (values[field.id] as string[]) ?? [];
                            setValue(field.id, e.target.checked ? [...current, opt] : current.filter((v) => v !== opt));
                          }}
                          className="w-5 h-5 rounded"
                        />
                        <span className="text-sm">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {field.type === "signature" && (
                <SignatureCanvas onChange={(dataUrl) => setValue(field.id, dataUrl)} />
              )}
            </div>
          ))}
        </div>
      ))}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => setStep("template")}
          className="flex-1 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-600 text-sm"
        >
          ← Back
        </button>
        <button
          onClick={submit}
          disabled={isPending}
          className="flex-1 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40"
        >
          {isPending ? "Generating PDF…" : "Submit"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/compliance/new/ComplianceForm.tsx
git commit -m "feat: multi-step compliance form with all field types"
```

---

## Task 10: /compliance/new server page

**Files:**
- Create: `src/app/compliance/new/page.tsx`

- [ ] **Step 1: Create `src/app/compliance/new/page.tsx`**

```typescript
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { ComplianceForm } from "./ComplianceForm";

export default async function NewComplianceDocumentPage() {
  const user = await requireRole(["technician", "director", "service_manager", "admin", "sales_engineer", "draftsman"]).catch(() => null);
  if (!user) redirect("/sign-in");

  const [jobs, templates] = await Promise.all([
    db.job.findMany({
      where: { status: { in: ["active", "scheduled"] } },
      select: { id: true, customerName: true, siteName: true },
      orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
    }),
    db.complianceTemplate.findMany({
      where: { isActive: true },
      select: { id: true, name: true, type: true, sections: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">New Compliance Document</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Fill in the required fields and sign.
          </p>
        </div>
        <ComplianceForm jobs={jobs} templates={templates} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/compliance/new/page.tsx
git commit -m "feat: /compliance/new server page"
```

---

## Task 11: Template list page (admin)

**Files:**
- Create: `src/app/compliance/templates/page.tsx`

- [ ] **Step 1: Create `src/app/compliance/templates/page.tsx`**

```typescript
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DeleteTemplateButton } from "./TemplateBuilder";

const TYPE_LABELS:  Record<string, string> = { swms: "SWMS", jsa: "JSA", whs: "WHS" };
const TYPE_COLOURS: Record<string, string> = {
  swms: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  jsa:  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  whs:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

export default async function TemplatesPage() {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) redirect("/sign-in");

  const templates = await db.complianceTemplate.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Compliance Templates</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage SWMS, JSA, and WHS templates</p>
          </div>
          <Link href="/compliance/templates/new" className="min-h-[40px] px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm flex items-center">
            New template
          </Link>
        </div>

        {templates.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">No templates yet. Create one to get started.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => {
              const sectionCount = Array.isArray(t.sections) ? (t.sections as unknown[]).length : 0;
              const fieldCount   = Array.isArray(t.sections)
                ? (t.sections as Array<{ fields?: unknown[] }>).reduce((sum, s) => sum + (s.fields?.length ?? 0), 0)
                : 0;
              return (
                <div key={t.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLOURS[t.type] ?? ""}`}>
                          {TYPE_LABELS[t.type] ?? t.type}
                        </span>
                        <p className="font-medium truncate">{t.name}</p>
                      </div>
                      <p className="text-xs text-slate-400">{sectionCount} sections · {fieldCount} fields</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Link href={`/compliance/templates/${t.id}/edit`} className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 underline underline-offset-2">
                        Edit
                      </Link>
                      <DeleteTemplateButton id={t.id} name={t.name} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/compliance/templates/page.tsx
git commit -m "feat: compliance template list page (admin)"
```

---

## Task 12: TemplateBuilder client component

**Files:**
- Create: `src/app/compliance/templates/TemplateBuilder.tsx`

**Interfaces:**
- Produces:
  - `<TemplateBuilder initialName="" initialType="swms" initialSections={[]} onSave={async (payload) => void} saving={false} />` — used by new + edit pages
  - `<DeleteTemplateButton id="..." name="..." />` — used by template list page

- [ ] **Step 1: Create `src/app/compliance/templates/TemplateBuilder.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import type { TemplateSections, TemplateField, TemplateSection, FieldType } from "@/lib/compliance/types";

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text",      label: "Short text"  },
  { value: "textarea",  label: "Long text"   },
  { value: "date",      label: "Date"        },
  { value: "checkbox",  label: "Checkbox"    },
  { value: "checklist", label: "Checklist"   },
  { value: "signature", label: "Signature"   },
];

const DOC_TYPES = [
  { value: "swms", label: "SWMS" },
  { value: "jsa",  label: "JSA"  },
  { value: "whs",  label: "WHS"  },
];

interface TemplateBuilderProps {
  initialName:     string;
  initialType:     string;
  initialSections: TemplateSections;
  onSave:          (payload: { name: string; type: string; sections: TemplateSections }) => Promise<void>;
  saving:          boolean;
}

function emptyField(): TemplateField {
  return { id: uuid(), label: "", type: "text", required: false };
}

function emptySection(): TemplateSection {
  return { id: uuid(), title: "", fields: [] };
}

export function TemplateBuilder({ initialName, initialType, initialSections, onSave, saving }: TemplateBuilderProps) {
  const [name,     setName]     = useState(initialName);
  const [type,     setType]     = useState(initialType || "swms");
  const [sections, setSections] = useState<TemplateSections>(initialSections.length > 0 ? initialSections : [emptySection()]);
  const [error,    setError]    = useState<string | null>(null);

  // Section operations
  function updateSectionTitle(id: string, title: string) {
    setSections((prev) => prev.map((s) => s.id === id ? { ...s, title } : s));
  }
  function addSection() {
    setSections((prev) => [...prev, emptySection()]);
  }
  function deleteSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }
  function moveSectionUp(index: number) {
    if (index === 0) return;
    setSections((prev) => { const a = [...prev]; [a[index - 1], a[index]] = [a[index], a[index - 1]]; return a; });
  }
  function moveSectionDown(index: number) {
    setSections((prev) => { if (index === prev.length - 1) return prev; const a = [...prev]; [a[index], a[index + 1]] = [a[index + 1], a[index]]; return a; });
  }

  // Field operations
  function addField(sectionId: string) {
    setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, fields: [...s.fields, emptyField()] } : s));
  }
  function updateField(sectionId: string, fieldId: string, patch: Partial<TemplateField>) {
    setSections((prev) => prev.map((s) => s.id !== sectionId ? s : {
      ...s,
      fields: s.fields.map((f) => f.id === fieldId ? { ...f, ...patch } : f),
    }));
  }
  function deleteField(sectionId: string, fieldId: string) {
    setSections((prev) => prev.map((s) => s.id !== sectionId ? s : { ...s, fields: s.fields.filter((f) => f.id !== fieldId) }));
  }
  function moveFieldUp(sectionId: string, index: number) {
    if (index === 0) return;
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;
      const fields = [...s.fields];
      [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]];
      return { ...s, fields };
    }));
  }
  function moveFieldDown(sectionId: string, index: number) {
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;
      if (index === s.fields.length - 1) return s;
      const fields = [...s.fields];
      [fields[index], fields[index + 1]] = [fields[index + 1], fields[index]];
      return { ...s, fields };
    }));
  }
  function updateChecklistOptions(sectionId: string, fieldId: string, rawOptions: string) {
    updateField(sectionId, fieldId, { options: rawOptions.split("\n").map((o) => o.trim()).filter(Boolean) });
  }

  async function handleSave() {
    setError(null);
    if (!name.trim()) { setError("Template name is required."); return; }
    if (sections.some((s) => !s.title.trim())) { setError("All sections must have a title."); return; }
    await onSave({ name: name.trim(), type, sections }).catch((e) => setError(e.message ?? "Failed to save."));
  }

  const inputCls = "w-full min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm";

  return (
    <div className="space-y-6">
      {/* Header fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium text-slate-500">Template name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard SWMS" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Document type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        <p className="text-sm font-semibold">Sections</p>
        {sections.map((section, si) => (
          <div key={section.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={section.title}
                onChange={(e) => updateSectionTitle(section.id, e.target.value)}
                placeholder="Section title"
                className="flex-1 min-h-[36px] rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3 text-sm font-medium"
              />
              <button onClick={() => moveSectionUp(si)}   className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none px-1" title="Move up">↑</button>
              <button onClick={() => moveSectionDown(si)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none px-1" title="Move down">↓</button>
              <button onClick={() => deleteSection(section.id)} className="text-red-400 hover:text-red-600 text-sm px-1" title="Delete section">✕</button>
            </div>

            {/* Fields */}
            <div className="space-y-2 pl-2">
              {section.fields.map((field, fi) => (
                <div key={field.id} className="rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => updateField(section.id, field.id, { label: e.target.value })}
                      placeholder="Field label"
                      className="flex-1 min-h-[34px] rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => updateField(section.id, field.id, { type: e.target.value as FieldType })}
                      className="min-h-[34px] rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm"
                    >
                      {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer whitespace-nowrap">
                      <input type="checkbox" checked={field.required} onChange={(e) => updateField(section.id, field.id, { required: e.target.checked })} className="w-4 h-4 rounded" />
                      Req.
                    </label>
                    <button onClick={() => moveFieldUp(section.id, fi)}   className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-base leading-none" title="Move up">↑</button>
                    <button onClick={() => moveFieldDown(section.id, fi)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-base leading-none" title="Move down">↓</button>
                    <button onClick={() => deleteField(section.id, field.id)} className="text-red-400 hover:text-red-600 text-xs" title="Delete field">✕</button>
                  </div>
                  {field.type === "checklist" && (
                    <div className="space-y-1">
                      <label className="text-xs text-slate-500">Options (one per line)</label>
                      <textarea
                        value={(field.options ?? []).join("\n")}
                        onChange={(e) => updateChecklistOptions(section.id, field.id, e.target.value)}
                        rows={3}
                        placeholder={"Harness\nHelmet\nSafety glasses"}
                        className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs resize-none"
                      />
                    </div>
                  )}
                </div>
              ))}
              <button
                onClick={() => addField(section.id)}
                className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
              >
                + Add field
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={addSection}
          className="w-full min-h-[40px] rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-sm text-slate-500 hover:border-amber-400 hover:text-amber-600 transition-colors"
        >
          + Add section
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save template"}
      </button>
    </div>
  );
}

// ─── DeleteTemplateButton ───────────────────────────────────────────────────

export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function doDelete() {
    startTransition(async () => {
      await fetch(`/api/compliance/templates/${id}`, { method: "DELETE" });
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="text-xs text-red-500 hover:text-red-700 underline underline-offset-2">
        Delete
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <span className="text-xs text-slate-500">Delete "{name}"?</span>
      <button onClick={() => setConfirming(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
      <button onClick={doDelete} disabled={isPending} className="text-xs text-red-600 hover:text-red-800 font-semibold disabled:opacity-40">
        {isPending ? "Deleting…" : "Confirm"}
      </button>
    </span>
  );
}
```

- [ ] **Step 2: Install uuid (needed for `uuid()` in TemplateBuilder)**

```bash
pnpm add uuid
pnpm add -D @types/uuid
```

- [ ] **Step 3: Commit**

```bash
git add src/app/compliance/templates/TemplateBuilder.tsx package.json pnpm-lock.yaml
git commit -m "feat: template builder component with section/field editor"
```

---

## Task 13: Template create and edit pages

**Files:**
- Create: `src/app/compliance/templates/new/page.tsx`
- Create: `src/app/compliance/templates/[id]/edit/page.tsx`

- [ ] **Step 1: Create `src/app/compliance/templates/new/page.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { TemplateBuilder } from "../TemplateBuilder";
import type { TemplateSections } from "@/lib/compliance/types";

export default function NewTemplatePage() {
  const router  = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleSave(payload: { name: string; type: string; sections: TemplateSections }) {
    setSaving(true);
    try {
      const res = await fetch("/api/compliance/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      router.push("/compliance/templates");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">New Template</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Build a new compliance document template.</p>
        </div>
        <TemplateBuilder
          initialName=""
          initialType="swms"
          initialSections={[]}
          onSave={handleSave}
          saving={saving}
        />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Create `src/app/compliance/templates/[id]/edit/page.tsx`**

```typescript
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect, notFound } from "next/navigation";
import { EditTemplateClient } from "./EditTemplateClient";

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  const user = await requireRole(["admin"]).catch(() => null);
  if (!user) redirect("/sign-in");

  const template = await db.complianceTemplate.findUnique({ where: { id: params.id } });
  if (!template) notFound();

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Edit Template</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{template.name}</p>
        </div>
        <EditTemplateClient
          id={template.id}
          initialName={template.name}
          initialType={template.type}
          initialSections={template.sections as unknown as import("@/lib/compliance/types").TemplateSections}
        />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: Create `src/app/compliance/templates/[id]/edit/EditTemplateClient.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TemplateBuilder } from "../../TemplateBuilder";
import type { TemplateSections } from "@/lib/compliance/types";

interface Props {
  id:              string;
  initialName:     string;
  initialType:     string;
  initialSections: TemplateSections;
}

export function EditTemplateClient({ id, initialName, initialType, initialSections }: Props) {
  const router  = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleSave(payload: { name: string; type: string; sections: TemplateSections }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/compliance/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      router.push("/compliance/templates");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <TemplateBuilder
      initialName={initialName}
      initialType={initialType}
      initialSections={initialSections}
      onSave={handleSave}
      saving={saving}
    />
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/compliance/templates/new/ src/app/compliance/templates/[id]/
git commit -m "feat: template create and edit pages"
```

---

## Task 14: TypeScript, lint, full test run, and final commit

**Files:** No new files — verification only.

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

Expected: all tests PASS (26 existing + new compliance tests).

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Fix any reported issues, then re-run to confirm zero errors.

- [ ] **Step 4: Build check**

```bash
pnpm build
```

Expected: build completes with no errors. Confirm `/compliance` and `/compliance/templates` appear in the route list.

- [ ] **Step 5: Final commit and push**

```bash
git add -A
git commit -m "feat: phase 2a complete — compliance document templates"
git push origin main
```

---

## Phase 2a Completion Checklist

- [ ] `pnpm test` — all tests pass
- [ ] `pnpm tsc --noEmit` — zero TypeScript errors
- [ ] `pnpm lint` — zero lint errors
- [ ] `pnpm build` — clean build
- [ ] `/compliance` page loads and lists documents
- [ ] "New document" flow: job → template → fill in ��� PDF generated → appears in list
- [ ] "View PDF" link opens the PDF via the blob proxy
- [ ] Signature canvas draws and is embedded in the PDF
- [ ] `/compliance/templates` is visible only to admin
- [ ] Admin can create, edit, and soft-delete templates
- [ ] Deleted templates do not appear in the fill-in flow
- [ ] Compliance nav item appears for all roles; Templates nav item appears for admin only
