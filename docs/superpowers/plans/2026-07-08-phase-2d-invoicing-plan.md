# Phase 2d — Invoicing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete invoicing workflow — list/detail pages, labour calculator, PDF generation, email sending via Resend, and payment status tracking.

**Architecture:** Schema extension to existing `Invoice` and `BusinessProfile` models (migration `invoice_v2`), invoicing lib (`generateInvoicePdf` + `sendInvoiceEmail`), five API routes, settings additions, invoice list and detail pages. Resend SDK for transactional email.

**Tech Stack:** Next.js 14 App Router, Prisma 7 + Neon (PostgreSQL), `@react-pdf/renderer` (already installed), Resend (new — install in Task 2), Vitest, Tailwind CSS.

## Global Constraints

- Roles with access: `admin`, `director` only
- Only `director` can mark an invoice as paid; both `admin` and `director` can edit base amount and send
- `technician`, `sales_engineer`, `draftsman`, `service_manager` get 401 from all invoice routes
- Invoice numbers format: `INV-YYYY-NNNN` (e.g. `INV-2026-0001`) — sequential, never reused
- All money amounts stored as `Decimal @db.Decimal(12, 2)` — consistent with existing Invoice fields
- `@react-pdf/renderer` must be used with `createElement` (not JSX) — matches existing `src/lib/compliance/generatePdf.ts` pattern
- Test runner: `pnpm vitest run` — all existing 136 tests must remain passing after every task
- `requireRole` import path: `@/lib/auth/clerk`
- `db` import path: `@/lib/db/client`
- Auth pattern: `const user = await requireRole([...]).catch(() => null); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });`

---

## File Structure

**New files:**
- `prisma/migrations/[timestamp]_invoice_v2/migration.sql`
- `src/lib/invoicing/generateInvoicePdf.ts` — PDF renderer
- `src/lib/invoicing/sendInvoiceEmail.ts` — Resend email sender
- `src/lib/invoicing/__tests__/invoicing.test.ts` — lib smoke tests
- `src/app/api/invoices/route.ts` — GET list
- `src/app/api/invoices/[id]/route.ts` — GET detail + PATCH
- `src/app/api/invoices/[id]/send/route.ts` — POST send email
- `src/app/api/invoices/[id]/pdf/route.ts` — GET PDF preview
- `src/app/api/invoices/__tests__/invoices.test.ts` — API tests
- `src/app/invoices/page.tsx` — server: auth + data fetch
- `src/app/invoices/InvoiceList.tsx` — client: status tabs + table
- `src/app/invoices/[id]/page.tsx` — server: auth + data fetch
- `src/app/invoices/[id]/InvoiceDetail.tsx` — client: labour, send, pay

**Modified files:**
- `prisma/schema.prisma` — add `InvoiceStatus` enum, extend `Invoice` + `BusinessProfile`
- `src/app/settings/SettingsForm.tsx` — add hourly rate + payment terms fields
- `src/app/api/settings/route.ts` — extend schema + GET response
- `src/lib/nav-config.ts` — add Invoices nav item

---

### Task 1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/[timestamp]_invoice_v2/migration.sql`

**Interfaces:**
- Produces: `InvoiceStatus` enum (`draft | sent | paid`), extended `Invoice` model, extended `BusinessProfile` model — used by all later tasks.

- [ ] **Step 1: Update `prisma/schema.prisma`**

Add the `InvoiceStatus` enum (after the existing `VariationStatus` enum) and replace the `Invoice` model and `BusinessProfile` model with the versions below. Do not touch any other models.

```prisma
enum InvoiceStatus {
  draft
  sent
  paid
}
```

Replace the existing `Invoice` model:

```prisma
model Invoice {
  id              String        @id @default(uuid())
  jobId           String        @unique
  invoiceNumber   String?       @unique
  status          InvoiceStatus @default(draft)
  baseAmount      Decimal       @db.Decimal(12, 2) @default(0)
  variationsTotal Decimal       @db.Decimal(12, 2) @default(0)
  totalAmount     Decimal       @db.Decimal(12, 2) @default(0)
  notes           String?
  sentAt          DateTime?
  sentToEmail     String?
  paidAt          DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  job Job @relation(fields: [jobId], references: [id])

  @@index([jobId])
  @@index([status])
}
```

Replace the existing `BusinessProfile` model:

```prisma
model BusinessProfile {
  id           String   @id @default(uuid())
  name         String   @default("CT Field Ops")
  abn          String   @default("")
  phone        String   @default("")
  email        String   @default("")
  address      String   @default("")
  logoUrl      String?
  hourlyRate   Float?
  paymentTerms String?
  updatedAt    DateTime @updatedAt
}
```

- [ ] **Step 2: Create migration file without applying it**

```bash
npx prisma migrate dev --create-only --name invoice_v2
```

This prints the path of the new migration file: `prisma/migrations/[timestamp]_invoice_v2/migration.sql`. Note the exact path.

- [ ] **Step 3: Replace the auto-generated SQL with the correct SQL**

Open the generated migration file and replace its entire contents with:

```sql
-- Create InvoiceStatus enum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'paid');

-- Extend Invoice table
ALTER TABLE "Invoice" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "status" "InvoiceStatus" NOT NULL DEFAULT 'draft';
ALTER TABLE "Invoice" ADD COLUMN "notes" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "sentAt" TIMESTAMPTZ;
ALTER TABLE "Invoice" ADD COLUMN "sentToEmail" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "paidAt" TIMESTAMPTZ;
ALTER TABLE "Invoice" ADD COLUMN "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Unique constraint on invoiceNumber
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- Status index
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- Extend BusinessProfile table
ALTER TABLE "BusinessProfile" ADD COLUMN "hourlyRate" FLOAT;
ALTER TABLE "BusinessProfile" ADD COLUMN "paymentTerms" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
```

- [ ] **Step 4: Apply the migration**

```bash
npx prisma migrate dev
```

Expected: `Your database is now in sync with your schema.`

- [ ] **Step 5: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output (zero errors).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add InvoiceStatus enum, extend Invoice and BusinessProfile for invoicing"
```

---

### Task 2: Invoicing lib — PDF generator and email sender

**Files:**
- Create: `src/lib/invoicing/generateInvoicePdf.ts`
- Create: `src/lib/invoicing/sendInvoiceEmail.ts`
- Create: `src/lib/invoicing/__tests__/invoicing.test.ts`

**Interfaces:**
- Consumes: `@react-pdf/renderer` (already installed), `resend` (install in Step 1)
- Produces:
  ```typescript
  // generateInvoicePdf.ts
  export interface InvoicePdfData {
    invoice: { invoiceNumber: string; baseAmount: number; variationsTotal: number; totalAmount: number; notes?: string | null; createdAt: string; };
    variations: { description: string; costEstimate: number }[];
    job: { customerName: string; siteName: string; siteAddress: string; jobType: string };
    businessProfile: { name: string; abn: string; address: string; logoUrl?: string | null; paymentTerms?: string | null; };
  }
  export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer>

  // sendInvoiceEmail.ts
  export interface SendInvoiceEmailOpts {
    to: string; from: string; invoiceNumber: string;
    jobDescription: string; totalAmount: number;
    pdfBuffer: Buffer; businessName: string;
  }
  export async function sendInvoiceEmail(opts: SendInvoiceEmailOpts): Promise<void>
  ```

- [ ] **Step 1: Install Resend**

```bash
pnpm add resend
```

Expected: `resend` added to `package.json`.

- [ ] **Step 2: Write the failing lib tests**

Create `src/lib/invoicing/__tests__/invoicing.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-pdf")),
  Document: ({ children }: any) => children,
  Page: ({ children }: any) => children,
  View: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Image: () => null,
  StyleSheet: { create: (s: any) => s },
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: "email-id" }) },
  })),
}));

import { generateInvoicePdf } from "../generateInvoicePdf";
import { sendInvoiceEmail } from "../sendInvoiceEmail";

const basePdfData = {
  invoice: {
    invoiceNumber: "INV-2026-0001",
    baseAmount: 1800,
    variationsTotal: 450,
    totalAmount: 2250,
    notes: null,
    createdAt: new Date("2026-07-08T00:00:00Z").toISOString(),
  },
  variations: [{ description: "Replace fill packs", costEstimate: 450 }],
  job: { customerName: "Rio Tinto", siteName: "Weipa Plant", siteAddress: "1 Mine Rd, Weipa QLD 4874", jobType: "Annual Service" },
  businessProfile: { name: "CT Field Ops", abn: "12 345 678 901", address: "Brisbane QLD", logoUrl: null, paymentTerms: "Payment due 14 days" },
};

beforeEach(() => vi.clearAllMocks());

describe("generateInvoicePdf", () => {
  it("returns a Buffer", async () => {
    const result = await generateInvoicePdf(basePdfData);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("does not throw with no variations", async () => {
    await expect(generateInvoicePdf({ ...basePdfData, variations: [] })).resolves.not.toThrow();
  });

  it("does not throw with no logo or payment terms", async () => {
    const data = { ...basePdfData, businessProfile: { ...basePdfData.businessProfile, logoUrl: null, paymentTerms: null } };
    await expect(generateInvoicePdf(data)).resolves.not.toThrow();
  });
});

describe("sendInvoiceEmail", () => {
  it("does not throw for valid opts", async () => {
    await expect(
      sendInvoiceEmail({
        to: "client@example.com",
        from: "invoices@ct.com",
        invoiceNumber: "INV-2026-0001",
        jobDescription: "Annual Service — Weipa Plant",
        totalAmount: 2250,
        pdfBuffer: Buffer.from("mock-pdf"),
        businessName: "CT Field Ops",
      })
    ).resolves.not.toThrow();
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
pnpm vitest run src/lib/invoicing/__tests__/invoicing.test.ts
```

Expected: FAIL — `Cannot find module '../generateInvoicePdf'`

- [ ] **Step 4: Create `src/lib/invoicing/generateInvoicePdf.ts`**

```typescript
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";

export interface InvoicePdfData {
  invoice: {
    invoiceNumber: string;
    baseAmount: number;
    variationsTotal: number;
    totalAmount: number;
    notes?: string | null;
    createdAt: string;
  };
  variations: { description: string; costEstimate: number }[];
  job: { customerName: string; siteName: string; siteAddress: string; jobType: string };
  businessProfile: {
    name: string;
    abn: string;
    address: string;
    logoUrl?: string | null;
    paymentTerms?: string | null;
  };
}

const styles = StyleSheet.create({
  page:       { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  headerRow:  { flexDirection: "row", justifyContent: "space-between", marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  logoImg:    { width: 48, height: 48, marginBottom: 4 },
  bizName:    { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  bizMeta:    { fontSize: 9, color: "#64748b" },
  invTitle:   { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right", marginBottom: 4 },
  invMeta:    { fontSize: 9, color: "#64748b", textAlign: "right" },
  billSection:{ marginBottom: 24 },
  sectionLabel:{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#64748b", marginBottom: 4, textTransform: "uppercase" },
  billTo:     { fontSize: 10 },
  divider:    { borderBottomWidth: 0.5, borderBottomColor: "#cbd5e1", marginBottom: 8, marginTop: 8 },
  tableHeader:{ flexDirection: "row", paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: "#cbd5e1", marginBottom: 4 },
  tableHDesc: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 9, color: "#475569" },
  tableHAmt:  { width: 80, fontFamily: "Helvetica-Bold", fontSize: 9, color: "#475569", textAlign: "right" },
  lineRow:    { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: "#f1f5f9" },
  lineDesc:   { flex: 1, fontSize: 10 },
  lineAmt:    { width: 80, fontSize: 10, textAlign: "right" },
  totalRow:   { flexDirection: "row", paddingTop: 10, marginTop: 4 },
  totalLabel: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 11, textAlign: "right", paddingRight: 12 },
  totalAmt:   { width: 80, fontFamily: "Helvetica-Bold", fontSize: 11, textAlign: "right" },
  notes:      { marginTop: 20, fontSize: 9, color: "#64748b", fontStyle: "italic" },
  footer:     { position: "absolute", bottom: 24, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 6, fontSize: 8, color: "#94a3b8", textAlign: "center" },
  paymentTerms:{ marginTop: 16, fontSize: 9, color: "#475569" },
});

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-AU"); } catch { return iso; }
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const { invoice, variations, job, businessProfile: bp } = data;

  const bizLeft = [
    ...(bp.logoUrl ? [createElement(Image, { src: bp.logoUrl, style: styles.logoImg })] : []),
    createElement(Text, { style: styles.bizName }, bp.name),
    ...(bp.abn ? [createElement(Text, { style: styles.bizMeta }, `ABN: ${bp.abn}`)] : []),
    ...(bp.address ? [createElement(Text, { style: styles.bizMeta }, bp.address)] : []),
  ];

  const invRight = [
    createElement(Text, { style: styles.invTitle }, "INVOICE"),
    createElement(Text, { style: styles.invMeta }, invoice.invoiceNumber),
    createElement(Text, { style: styles.invMeta }, `Date: ${fmtDate(invoice.createdAt)}`),
  ];

  const lineItems = [
    { description: `Labour — ${job.jobType}`, amount: invoice.baseAmount },
    ...variations.map((v) => ({ description: `Variation: ${v.description}`, amount: v.costEstimate })),
  ];

  const doc = createElement(
    Document,
    null,
    createElement(
      Page,
      { size: "A4", style: styles.page },
      // Header
      createElement(
        View,
        { style: styles.headerRow },
        createElement(View, null, ...bizLeft),
        createElement(View, null, ...invRight),
      ),
      // Bill To
      createElement(
        View,
        { style: styles.billSection },
        createElement(Text, { style: styles.sectionLabel }, "Bill To"),
        createElement(Text, { style: styles.billTo }, job.customerName),
        createElement(Text, { style: styles.billTo }, job.siteName),
        createElement(Text, { style: styles.billTo }, job.siteAddress),
      ),
      // Line items table
      createElement(
        View,
        { style: styles.tableHeader },
        createElement(Text, { style: styles.tableHDesc }, "Description"),
        createElement(Text, { style: styles.tableHAmt }, "Amount"),
      ),
      ...lineItems.map((line, i) =>
        createElement(
          View,
          { key: String(i), style: styles.lineRow },
          createElement(Text, { style: styles.lineDesc }, line.description),
          createElement(Text, { style: styles.lineAmt }, fmtMoney(line.amount)),
        )
      ),
      // Total
      createElement(
        View,
        { style: styles.totalRow },
        createElement(Text, { style: styles.totalLabel }, "Total:"),
        createElement(Text, { style: styles.totalAmt }, fmtMoney(invoice.totalAmount)),
      ),
      // Notes
      ...(invoice.notes
        ? [createElement(Text, { style: styles.notes }, `Notes: ${invoice.notes}`)]
        : []),
      // Payment terms
      ...(bp.paymentTerms
        ? [createElement(Text, { style: styles.paymentTerms }, bp.paymentTerms)]
        : []),
      // Footer
      createElement(
        Text,
        { style: styles.footer, fixed: true },
        `Generated by ${bp.name} · ${new Date().toLocaleString("en-AU")}`
      ),
    )
  );

  return renderToBuffer(doc) as Promise<Buffer>;
}
```

- [ ] **Step 5: Create `src/lib/invoicing/sendInvoiceEmail.ts`**

```typescript
import { Resend } from "resend";

export interface SendInvoiceEmailOpts {
  to: string;
  from: string;
  invoiceNumber: string;
  jobDescription: string;
  totalAmount: number;
  pdfBuffer: Buffer;
  businessName: string;
}

export async function sendInvoiceEmail(opts: SendInvoiceEmailOpts): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: opts.from,
    to: opts.to,
    subject: `Invoice ${opts.invoiceNumber} — ${opts.jobDescription}`,
    html: `<p>Please find attached invoice <strong>${opts.invoiceNumber}</strong> for <strong>${opts.jobDescription}</strong>.</p><p>Total: <strong>$${opts.totalAmount.toFixed(2)}</strong></p><p>Thanks,<br>${opts.businessName}</p>`,
    attachments: [
      {
        filename: `${opts.invoiceNumber}.pdf`,
        content: opts.pdfBuffer,
      },
    ],
  });
}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
pnpm vitest run src/lib/invoicing/__tests__/invoicing.test.ts
```

Expected: `Tests  4 passed (4)`

- [ ] **Step 7: Run full suite to confirm no regressions**

```bash
pnpm vitest run
```

Expected: all 136 existing tests + 4 new = 140 passing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/invoicing/
git commit -m "feat: add generateInvoicePdf and sendInvoiceEmail invoicing lib"
```

---

### Task 3: API routes and tests

**Files:**
- Create: `src/app/api/invoices/route.ts`
- Create: `src/app/api/invoices/[id]/route.ts`
- Create: `src/app/api/invoices/[id]/send/route.ts`
- Create: `src/app/api/invoices/[id]/pdf/route.ts`
- Create: `src/app/api/invoices/__tests__/invoices.test.ts`

**Interfaces:**
- Consumes: `generateInvoicePdf` and `sendInvoiceEmail` from Task 2, `db` from `@/lib/db/client`, `requireRole` from `@/lib/auth/clerk`
- Produces: REST API consumed by Task 5 (list page) and Task 6 (detail page)

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/invoices/__tests__/invoices.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    $transaction: vi.fn(),
    invoice: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    businessProfile: { findFirst: vi.fn() },
    job: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/invoicing/generateInvoicePdf", () => ({
  generateInvoicePdf: vi.fn().mockResolvedValue(Buffer.from("pdf")),
}));
vi.mock("@/lib/invoicing/sendInvoiceEmail", () => ({
  sendInvoiceEmail: vi.fn().mockResolvedValue(undefined),
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { generateInvoicePdf } from "@/lib/invoicing/generateInvoicePdf";
import { sendInvoiceEmail } from "@/lib/invoicing/sendInvoiceEmail";
import { GET as GET_LIST } from "../route";
import { GET as GET_DETAIL, PATCH } from "../[id]/route";
import { POST as POST_SEND } from "../[id]/send/route";
import { GET as GET_PDF } from "../[id]/pdf/route";

const ADMIN    = { id: "a1", role: "admin"     as const, name: "Admin", clerkId: "ca1", email: "a@c.com", isActive: true };
const DIRECTOR = { id: "d1", role: "director"  as const, name: "Boss",  clerkId: "cd1", email: "d@c.com", isActive: true };
const TECH     = { id: "t1", role: "technician" as const, name: "Jake", clerkId: "ct1", email: "t@c.com", isActive: true };

const INV_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const baseInvoice = {
  id: INV_ID,
  jobId: "j1",
  invoiceNumber: null,
  status: "draft",
  baseAmount: { toNumber: () => 0 },
  variationsTotal: { toNumber: () => 450 },
  totalAmount: { toNumber: () => 450 },
  notes: null,
  sentAt: null,
  sentToEmail: null,
  paidAt: null,
  createdAt: new Date("2026-07-08T00:00:00Z"),
  updatedAt: new Date("2026-07-08T00:00:00Z"),
  job: { id: "j1", customerName: "Rio Tinto", siteName: "Weipa", jobType: "Annual Service", siteAddress: "1 Mine Rd" },
};

const baseJob = {
  id: "j1", customerName: "Rio Tinto", siteName: "Weipa", siteAddress: "1 Mine Rd", jobType: "Annual Service",
  timeEntries: [{ durationMinutes: 480 }],
  variations: [{ id: "v1", description: "Fill packs", costEstimate: { toNumber: () => 450 }, decidedAt: new Date("2026-07-01T00:00:00Z") }],
};

const baseProfile = { name: "CT Field Ops", abn: "12 345 678 901", address: "Brisbane", email: "ct@ct.com", logoUrl: null, paymentTerms: "Net 14" };

function makeReq(url: string, init?: RequestInit) {
  return new Request(`http://localhost${url}`, init);
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/invoices", () => {
  it("returns 401 for technician", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET_LIST();
    expect(res.status).toBe(401);
  });

  it("returns 200 with invoice list for admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.invoice.findMany).mockResolvedValue([baseInvoice] as any);
    const res = await GET_LIST();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(INV_ID);
  });
});

describe("PATCH /api/invoices/[id]", () => {
  it("returns 401 for service_manager", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await PATCH(makeReq(`/api/invoices/${INV_ID}`, { method: "PATCH", body: JSON.stringify({ baseAmount: 1800 }) }), { params: { id: INV_ID } });
    expect(res.status).toBe(401);
  });

  it("recalculates totalAmount = baseAmount + variationsTotal", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.invoice.findUnique).mockResolvedValue(baseInvoice as any);
    const updatedInvoice = { ...baseInvoice, invoiceNumber: "INV-2026-0001", baseAmount: { toNumber: () => 1800 }, totalAmount: { toNumber: () => 2250 } };
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) => fn({
      invoice: { count: vi.fn().mockResolvedValue(0), update: vi.fn().mockResolvedValue(updatedInvoice) },
    }));
    const res = await PATCH(makeReq(`/api/invoices/${INV_ID}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseAmount: 1800 }) }), { params: { id: INV_ID } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalAmount).toBe(2250);
  });

  it("generates invoiceNumber INV-YYYY-NNNN when null", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.invoice.findUnique).mockResolvedValue(baseInvoice as any);
    let capturedNumber = "";
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) => {
      const result = await fn({
        invoice: {
          count: vi.fn().mockResolvedValue(0),
          update: vi.fn().mockImplementation(async ({ data }: any) => {
            capturedNumber = data.invoiceNumber;
            return { ...baseInvoice, ...data };
          }),
        },
      });
      return result;
    });
    await PATCH(makeReq(`/api/invoices/${INV_ID}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseAmount: 0 }) }), { params: { id: INV_ID } });
    expect(capturedNumber).toMatch(/^INV-\d{4}-\d{4}$/);
  });

  it("returns 403 when admin tries to mark as paid", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.invoice.findUnique).mockResolvedValue(baseInvoice as any);
    const res = await PATCH(makeReq(`/api/invoices/${INV_ID}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paid" }) }), { params: { id: INV_ID } });
    expect(res.status).toBe(403);
  });

  it("sets paidAt when director marks as paid", async () => {
    vi.mocked(requireRole).mockResolvedValue(DIRECTOR as any);
    const sentInvoice = { ...baseInvoice, invoiceNumber: "INV-2026-0001", status: "sent" };
    vi.mocked(db.invoice.findUnique).mockResolvedValue(sentInvoice as any);
    let capturedData: any = null;
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) => {
      return fn({
        invoice: {
          count: vi.fn().mockResolvedValue(1),
          update: vi.fn().mockImplementation(async ({ data }: any) => { capturedData = data; return { ...sentInvoice, ...data }; }),
        },
      });
    });
    const res = await PATCH(makeReq(`/api/invoices/${INV_ID}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paid" }) }), { params: { id: INV_ID } });
    expect(res.status).toBe(200);
    expect(capturedData.paidAt).toBeInstanceOf(Date);
    expect(capturedData.status).toBe("paid");
  });
});

describe("POST /api/invoices/[id]/send", () => {
  it("returns 422 for invalid email", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    const res = await POST_SEND(makeReq(`/api/invoices/${INV_ID}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "not-an-email" }) }), { params: { id: INV_ID } });
    expect(res.status).toBe(422);
  });

  it("calls sendInvoiceEmail and returns sentAt for valid request", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    const invWithNumber = { ...baseInvoice, invoiceNumber: "INV-2026-0001" };
    vi.mocked(db.invoice.findUnique).mockResolvedValue(invWithNumber as any);
    vi.mocked(db.job.findUnique).mockResolvedValue(baseJob as any);
    vi.mocked(db.businessProfile.findFirst).mockResolvedValue(baseProfile as any);
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) => {
      return fn({ invoice: { count: vi.fn().mockResolvedValue(1), update: vi.fn().mockResolvedValue({ ...invWithNumber, status: "sent", sentAt: new Date(), sentToEmail: "client@example.com" }) } });
    });
    const res = await POST_SEND(makeReq(`/api/invoices/${INV_ID}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "client@example.com" }) }), { params: { id: INV_ID } });
    expect(res.status).toBe(200);
    expect(sendInvoiceEmail).toHaveBeenCalledOnce();
    const data = await res.json();
    expect(data).toHaveProperty("sentAt");
    expect(data.sentToEmail).toBe("client@example.com");
  });
});

describe("GET /api/invoices/[id]/pdf", () => {
  it("returns application/pdf content type", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as any);
    vi.mocked(db.invoice.findUnique).mockResolvedValue({ ...baseInvoice, invoiceNumber: "INV-2026-0001" } as any);
    vi.mocked(db.job.findUnique).mockResolvedValue(baseJob as any);
    vi.mocked(db.businessProfile.findFirst).mockResolvedValue(baseProfile as any);
    const res = await GET_PDF(makeReq(`/api/invoices/${INV_ID}/pdf`), { params: { id: INV_ID } });
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm vitest run src/app/api/invoices/__tests__/invoices.test.ts
```

Expected: FAIL — `Cannot find module '../route'`

- [ ] **Step 3: Create `src/app/api/invoices/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET() {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoices = await db.invoice.findMany({
    include: {
      job: { select: { id: true, customerName: true, siteName: true, jobType: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      baseAmount: Number(inv.baseAmount),
      variationsTotal: Number(inv.variationsTotal),
      totalAmount: Number(inv.totalAmount),
      sentAt: inv.sentAt?.toISOString() ?? null,
      paidAt: inv.paidAt?.toISOString() ?? null,
      createdAt: inv.createdAt.toISOString(),
      job: inv.job,
    }))
  );
}
```

- [ ] **Step 4: Create `src/app/api/invoices/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const patchSchema = z.object({
  baseAmount: z.number().nonnegative().optional(),
  notes: z.string().nullable().optional(),
  status: z.literal("paid").optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoice = await db.invoice.findUnique({
    where: { id: params.id },
    include: {
      job: {
        select: {
          id: true, customerName: true, siteName: true, siteAddress: true, jobType: true,
          timeEntries: { where: { status: "complete" }, select: { durationMinutes: true } },
          variations: {
            where: { status: "approved" },
            select: { id: true, description: true, costEstimate: true, decidedAt: true },
          },
        },
      },
    },
  });

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    baseAmount: Number(invoice.baseAmount),
    variationsTotal: Number(invoice.variationsTotal),
    totalAmount: Number(invoice.totalAmount),
    notes: invoice.notes,
    sentAt: invoice.sentAt?.toISOString() ?? null,
    sentToEmail: invoice.sentToEmail,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    createdAt: invoice.createdAt.toISOString(),
    job: {
      ...invoice.job,
      variations: invoice.job.variations.map((v) => ({
        id: v.id,
        description: v.description,
        costEstimate: Number(v.costEstimate),
        decidedAt: v.decidedAt?.toISOString() ?? null,
      })),
    },
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  if (parsed.data.status === "paid" && user.role !== "director") {
    return NextResponse.json({ error: "Only directors can mark invoices as paid" }, { status: 403 });
  }

  const existing = await db.invoice.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.$transaction(async (tx) => {
    let invoiceNumber = existing.invoiceNumber;
    if (!invoiceNumber) {
      const count = await tx.invoice.count();
      invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
    }

    const newBaseAmount = parsed.data.baseAmount !== undefined ? parsed.data.baseAmount : Number(existing.baseAmount);
    const totalAmount = newBaseAmount + Number(existing.variationsTotal);

    return tx.invoice.update({
      where: { id: params.id },
      data: {
        invoiceNumber,
        ...(parsed.data.baseAmount !== undefined ? { baseAmount: parsed.data.baseAmount, totalAmount } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        ...(parsed.data.status === "paid" ? { status: "paid", paidAt: new Date() } : {}),
      },
    });
  });

  return NextResponse.json({
    id: updated.id,
    invoiceNumber: updated.invoiceNumber,
    status: updated.status,
    baseAmount: Number(updated.baseAmount),
    variationsTotal: Number(updated.variationsTotal),
    totalAmount: Number(updated.totalAmount),
    notes: updated.notes,
    sentAt: updated.sentAt?.toISOString() ?? null,
    sentToEmail: updated.sentToEmail,
    paidAt: updated.paidAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
}
```

- [ ] **Step 5: Create `src/app/api/invoices/[id]/send/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { generateInvoicePdf } from "@/lib/invoicing/generateInvoicePdf";
import { sendInvoiceEmail } from "@/lib/invoicing/sendInvoiceEmail";

const sendSchema = z.object({ email: z.string().email("Invalid email address") });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });

  const invoice = await db.invoice.findUnique({ where: { id: params.id } });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [job, businessProfile] = await Promise.all([
    db.job.findUnique({
      where: { id: invoice.jobId },
      select: {
        customerName: true, siteName: true, siteAddress: true, jobType: true,
        variations: { where: { status: "approved" }, select: { description: true, costEstimate: true } },
      },
    }),
    db.businessProfile.findFirst(),
  ]);

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Ensure invoice number, generate PDF, send email — all in one transaction for the DB update
  const updated = await db.$transaction(async (tx) => {
    let { invoiceNumber } = invoice;
    if (!invoiceNumber) {
      const count = await tx.invoice.count();
      invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
    }

    const pdfData = {
      invoice: {
        invoiceNumber,
        baseAmount: Number(invoice.baseAmount),
        variationsTotal: Number(invoice.variationsTotal),
        totalAmount: Number(invoice.totalAmount),
        notes: invoice.notes,
        createdAt: invoice.createdAt.toISOString(),
      },
      variations: job.variations.map((v) => ({ description: v.description, costEstimate: Number(v.costEstimate) })),
      job: { customerName: job.customerName, siteName: job.siteName, siteAddress: job.siteAddress, jobType: job.jobType },
      businessProfile: {
        name: businessProfile?.name ?? "CT Field Ops",
        abn: businessProfile?.abn ?? "",
        address: businessProfile?.address ?? "",
        logoUrl: businessProfile?.logoUrl ?? null,
        paymentTerms: businessProfile?.paymentTerms ?? null,
      },
    };

    const pdfBuffer = await generateInvoicePdf(pdfData);

    await sendInvoiceEmail({
      to: parsed.data.email,
      from: process.env.RESEND_FROM_EMAIL ?? `invoices@resend.dev`,
      invoiceNumber,
      jobDescription: `${job.jobType} — ${job.siteName}`,
      totalAmount: Number(invoice.totalAmount),
      pdfBuffer,
      businessName: businessProfile?.name ?? "CT Field Ops",
    });

    return tx.invoice.update({
      where: { id: params.id },
      data: { invoiceNumber, status: "sent", sentAt: new Date(), sentToEmail: parsed.data.email },
    });
  });

  return NextResponse.json({
    sentAt: updated.sentAt?.toISOString() ?? null,
    sentToEmail: updated.sentToEmail,
  });
}
```

- [ ] **Step 6: Create `src/app/api/invoices/[id]/pdf/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { generateInvoicePdf } from "@/lib/invoicing/generateInvoicePdf";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoice = await db.invoice.findUnique({ where: { id: params.id } });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [job, businessProfile] = await Promise.all([
    db.job.findUnique({
      where: { id: invoice.jobId },
      select: {
        customerName: true, siteName: true, siteAddress: true, jobType: true,
        variations: { where: { status: "approved" }, select: { description: true, costEstimate: true } },
      },
    }),
    db.businessProfile.findFirst(),
  ]);

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const invoiceNumber = invoice.invoiceNumber ?? "DRAFT";

  const pdfBuffer = await generateInvoicePdf({
    invoice: {
      invoiceNumber,
      baseAmount: Number(invoice.baseAmount),
      variationsTotal: Number(invoice.variationsTotal),
      totalAmount: Number(invoice.totalAmount),
      notes: invoice.notes,
      createdAt: invoice.createdAt.toISOString(),
    },
    variations: job.variations.map((v) => ({ description: v.description, costEstimate: Number(v.costEstimate) })),
    job: { customerName: job.customerName, siteName: job.siteName, siteAddress: job.siteAddress, jobType: job.jobType },
    businessProfile: {
      name: businessProfile?.name ?? "CT Field Ops",
      abn: businessProfile?.abn ?? "",
      address: businessProfile?.address ?? "",
      logoUrl: businessProfile?.logoUrl ?? null,
      paymentTerms: businessProfile?.paymentTerms ?? null,
    },
  });

  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoiceNumber}.pdf"`,
    },
  });
}
```

- [ ] **Step 7: Run API tests — expect PASS**

```bash
pnpm vitest run src/app/api/invoices/__tests__/invoices.test.ts
```

Expected: `Tests  9 passed (9)`

- [ ] **Step 8: Run full suite**

```bash
pnpm vitest run
```

Expected: 149 passing (136 + 4 lib + 9 API).

- [ ] **Step 9: Commit**

```bash
git add src/app/api/invoices/
git commit -m "feat: add invoice API routes — list, detail, PATCH, send, PDF"
```

---

### Task 4: Settings additions — hourly rate and payment terms

**Files:**
- Modify: `src/app/settings/SettingsForm.tsx`
- Modify: `src/app/api/settings/route.ts`
- Modify: `src/app/settings/page.tsx`

**Interfaces:**
- Consumes: extended `BusinessProfile` model from Task 1
- Produces: Settings form with two new fields; GET /api/settings returns `hourlyRate` and `paymentTerms`

- [ ] **Step 1: Update `src/app/api/settings/route.ts`**

Add `hourlyRate` and `paymentTerms` to the update schema and include them in the GET response:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getSessionUser, requireRole } from "@/lib/auth/clerk";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.businessProfile.findFirst();
  return NextResponse.json(profile ?? {
    name: "CT Field Ops", abn: "", phone: "", email: "", address: "",
    logoUrl: null, hourlyRate: null, paymentTerms: null,
  });
}

const updateSchema = z.object({
  name:         z.string().min(1, "Name is required").max(100).optional(),
  abn:          z.string().max(20).optional(),
  phone:        z.string().max(30).optional(),
  email:        z.string().email("Invalid email").or(z.literal("")).optional(),
  address:      z.string().max(200).optional(),
  hourlyRate:   z.number().positive().nullable().optional(),
  paymentTerms: z.string().max(200).optional(),
});

export async function PATCH(req: Request) {
  try {
    await requireRole(["director", "admin"]);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation error" }, { status: 422 });
  }

  const existing = await db.businessProfile.findFirst();
  const profile = existing
    ? await db.businessProfile.update({ where: { id: existing.id }, data: parsed.data })
    : await db.businessProfile.create({ data: { name: "CT Field Ops", abn: "", phone: "", email: "", address: "", ...parsed.data } });

  return NextResponse.json(profile);
}
```

- [ ] **Step 2: Update `src/app/settings/SettingsForm.tsx`**

Add `hourlyRate: number | null` and `paymentTerms: string` to the `BusinessProfile` interface, add them to the `form` state, and add two new form fields after the Address textarea, before the submit button. The rest of the file is unchanged.

Replace the `BusinessProfile` interface:

```typescript
interface BusinessProfile {
  name: string;
  abn: string;
  phone: string;
  email: string;
  address: string;
  hourlyRate: number | null;
  paymentTerms: string;
}
```

Replace the initial `useForm` state to include the new fields:

```typescript
const [form, setForm] = useState<BusinessProfile>({
  ...initial,
  hourlyRate: initial.hourlyRate ?? null,
  paymentTerms: initial.paymentTerms ?? "",
});
```

Add a `setNum` helper alongside the existing `set`:

```typescript
const setNum = (field: "hourlyRate") => (e: React.ChangeEvent<HTMLInputElement>) => {
  const val = e.target.value === "" ? null : Number(e.target.value);
  setForm((f) => ({ ...f, [field]: val }));
  if (status !== "idle") setStatus("idle");
};
```

Add these two new fields in the form JSX, after the Address textarea and before the submit button:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
  <div>
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
      Hourly rate ($) <span className="font-normal text-slate-400">optional</span>
    </label>
    <input
      type="number"
      inputMode="decimal"
      value={form.hourlyRate ?? ""}
      onChange={setNum("hourlyRate")}
      min={0}
      step={0.01}
      placeholder="145.00"
      className={inputClass}
    />
    <p className="mt-1 text-xs text-slate-400">Used to pre-fill the labour calculator on invoices.</p>
  </div>
  <div>
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
      Payment terms <span className="font-normal text-slate-400">optional</span>
    </label>
    <input
      type="text"
      value={form.paymentTerms}
      onChange={set("paymentTerms")}
      maxLength={200}
      placeholder="Payment due 14 days from invoice date"
      className={inputClass}
    />
    <p className="mt-1 text-xs text-slate-400">Shown in the footer of invoice PDFs.</p>
  </div>
</div>
```

- [ ] **Step 3: Update `src/app/settings/page.tsx`**

Pass `hourlyRate` and `paymentTerms` from the DB query to the `SettingsForm` component. The existing `initial` object only has five fields — extend it:

```typescript
const initial = {
  name:         profile?.name         ?? "CT Field Ops",
  abn:          profile?.abn          ?? "",
  phone:        profile?.phone        ?? "",
  email:        profile?.email        ?? "",
  address:      profile?.address      ?? "",
  hourlyRate:   profile?.hourlyRate   ?? null,
  paymentTerms: profile?.paymentTerms ?? "",
};
```

The `SettingsFormProps` in `SettingsForm.tsx` uses `initial: BusinessProfile` — the shape already matches.

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Run full suite**

```bash
pnpm vitest run
```

Expected: all 149 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/app/settings/SettingsForm.tsx src/app/api/settings/route.ts src/app/settings/page.tsx
git commit -m "feat: add hourly rate and payment terms to settings"
```

---

### Task 5: Nav item and invoice list page

**Files:**
- Modify: `src/lib/nav-config.ts`
- Create: `src/app/invoices/page.tsx`
- Create: `src/app/invoices/InvoiceList.tsx`

**Interfaces:**
- Consumes: `GET /api/invoices` response from Task 3
- Produces: `/invoices` page visible in nav for `admin` + `director`; status tabs; rows link to `/invoices/[id]`

- [ ] **Step 1: Add Invoices to `src/lib/nav-config.ts`**

Add `Receipt` to the existing lucide-react import list, then add the Invoices nav item after the Quotes item:

```typescript
import {
  // ... existing imports ...
  Receipt,
} from "lucide-react";
```

Add to `navItems` array (after the Quotes item):

```typescript
{
  label: "Invoices",
  href: "/invoices",
  icon: Receipt,
  description: "Invoice management and sending",
  visibleTo: ["admin", "director"],
  phase: "2",
},
```

- [ ] **Step 2: Create `src/app/invoices/page.tsx`**

```typescript
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { InvoiceList } from "./InvoiceList";

export default async function InvoicesPage() {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) redirect("/");

  const invoices = await db.invoice.findMany({
    include: {
      job: { select: { id: true, customerName: true, siteName: true, jobType: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status as "draft" | "sent" | "paid",
    baseAmount: Number(inv.baseAmount),
    variationsTotal: Number(inv.variationsTotal),
    totalAmount: Number(inv.totalAmount),
    sentAt: inv.sentAt?.toISOString() ?? null,
    paidAt: inv.paidAt?.toISOString() ?? null,
    createdAt: inv.createdAt.toISOString(),
    job: inv.job,
  }));

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Invoices</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage and send invoices to customers
          </p>
        </div>
        <InvoiceList invoices={rows} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: Create `src/app/invoices/InvoiceList.tsx`**

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";

interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  status: "draft" | "sent" | "paid";
  totalAmount: number;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
  job: { id: string; customerName: string; siteName: string; jobType: string };
}

interface InvoiceListProps {
  invoices: InvoiceRow[];
}

type Tab = "all" | "draft" | "sent" | "paid";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  sent:  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  paid:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
};

export function InvoiceList({ invoices }: InvoiceListProps) {
  const [tab, setTab] = useState<Tab>("all");

  const filtered = tab === "all" ? invoices : invoices.filter((inv) => inv.status === tab);

  const tabs: { key: Tab; label: string }[] = [
    { key: "all",   label: `All (${invoices.length})` },
    { key: "draft", label: `Draft (${invoices.filter((i) => i.status === "draft").length})` },
    { key: "sent",  label: `Sent (${invoices.filter((i) => i.status === "sent").length})` },
    { key: "paid",  label: `Paid (${invoices.filter((i) => i.status === "paid").length})` },
  ];

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? "border-amber-500 text-amber-600 dark:text-amber-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4">No invoices in this category.</p>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {["Invoice #", "Customer — Site", "Job type", "Total", "Status", "Date"].map((h) => (
                  <th key={h} className="pb-2 pr-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 pr-4">
                    <Link href={`/invoices/${inv.id}`} className="font-mono text-amber-600 dark:text-amber-400 hover:underline">
                      {inv.invoiceNumber ?? "—"}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <Link href={`/invoices/${inv.id}`} className="hover:underline">
                      {inv.job.customerName} — {inv.job.siteName}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-slate-500">{inv.job.jobType}</td>
                  <td className="py-3 pr-4 font-semibold">${inv.totalAmount.toFixed(2)}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[inv.status]}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-500">
                    {new Date(inv.createdAt).toLocaleDateString("en-AU")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Run full suite**

```bash
pnpm vitest run
```

Expected: 149 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav-config.ts src/app/invoices/
git commit -m "feat: add Invoices nav item and invoice list page with status tabs"
```

---

### Task 6: Invoice detail page

**Files:**
- Create: `src/app/invoices/[id]/page.tsx`
- Create: `src/app/invoices/[id]/InvoiceDetail.tsx`

**Interfaces:**
- Consumes: `GET /api/invoices/[id]`, `PATCH /api/invoices/[id]`, `POST /api/invoices/[id]/send` from Task 3; `hourlyRate` from business profile
- Produces: Full invoice detail UI — labour calculator, line items, notes, send panel, mark as paid

- [ ] **Step 1: Create `src/app/invoices/[id]/page.tsx`**

```typescript
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { redirect, notFound } from "next/navigation";
import { InvoiceDetail } from "./InvoiceDetail";

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const user = await requireRole(["admin", "director"]).catch(() => null);
  if (!user) redirect("/");

  const invoice = await db.invoice.findUnique({
    where: { id: params.id },
    include: {
      job: {
        select: {
          id: true, customerName: true, siteName: true, siteAddress: true, jobType: true,
          timeEntries: { where: { status: "complete" }, select: { durationMinutes: true } },
          variations: {
            where: { status: "approved" },
            select: { id: true, description: true, costEstimate: true, decidedAt: true },
          },
        },
      },
    },
  });

  if (!invoice) notFound();

  const businessProfile = await db.businessProfile.findFirst();

  const actualMinutes = invoice.job.timeEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const actualHours = Math.round((actualMinutes / 60) * 10) / 10;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <InvoiceDetail
          invoice={{
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            status: invoice.status as "draft" | "sent" | "paid",
            baseAmount: Number(invoice.baseAmount),
            variationsTotal: Number(invoice.variationsTotal),
            totalAmount: Number(invoice.totalAmount),
            notes: invoice.notes,
            sentAt: invoice.sentAt?.toISOString() ?? null,
            sentToEmail: invoice.sentToEmail,
            paidAt: invoice.paidAt?.toISOString() ?? null,
            createdAt: invoice.createdAt.toISOString(),
          }}
          job={{
            customerName: invoice.job.customerName,
            siteName: invoice.job.siteName,
            siteAddress: invoice.job.siteAddress,
            jobType: invoice.job.jobType,
            actualHours,
          }}
          variations={invoice.job.variations.map((v) => ({
            id: v.id,
            description: v.description,
            costEstimate: Number(v.costEstimate),
          }))}
          defaultHourlyRate={businessProfile?.hourlyRate ?? null}
          userRole={user.role as "admin" | "director"}
        />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Create `src/app/invoices/[id]/InvoiceDetail.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

interface Invoice {
  id: string;
  invoiceNumber: string | null;
  status: "draft" | "sent" | "paid";
  baseAmount: number;
  variationsTotal: number;
  totalAmount: number;
  notes: string | null;
  sentAt: string | null;
  sentToEmail: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface Variation {
  id: string;
  description: string;
  costEstimate: number;
}

interface InvoiceDetailProps {
  invoice: Invoice;
  job: { customerName: string; siteName: string; siteAddress: string; jobType: string; actualHours: number };
  variations: Variation[];
  defaultHourlyRate: number | null;
  userRole: "admin" | "director";
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  sent:  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  paid:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
};

const inp = "w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base";

export function InvoiceDetail({ invoice: initial, job, variations, defaultHourlyRate, userRole }: InvoiceDetailProps) {
  const router = useRouter();
  const [invoice, setInvoice] = useState(initial);

  // Labour section
  const [labourMode, setLabourMode] = useState<"direct" | "calculator">("direct");
  const [baseInput, setBaseInput] = useState(initial.baseAmount > 0 ? String(initial.baseAmount) : "");
  const [hourlyRate, setHourlyRate] = useState(defaultHourlyRate != null ? String(defaultHourlyRate) : "");
  const [labourError, setLabourError] = useState<string | null>(null);
  const [isSavingLabour, startLabourTransition] = useTransition();

  // Notes section
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [isSavingNotes, startNotesTransition] = useTransition();
  const [notesError, setNotesError] = useState<string | null>(null);

  // Send section
  const [sendEmail, setSendEmail] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, startSendTransition] = useTransition();

  // Mark as paid
  const [isPaying, startPayTransition] = useTransition();
  const [payError, setPayError] = useState<string | null>(null);

  const calculatedLabour = hourlyRate ? job.actualHours * Number(hourlyRate) : null;

  async function patchInvoice(data: Record<string, unknown>) {
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
    return res.json() as Promise<Invoice>;
  }

  function saveLabour() {
    const amount = parseFloat(baseInput);
    if (isNaN(amount) || amount < 0) { setLabourError("Enter a valid amount."); return; }
    setLabourError(null);
    startLabourTransition(async () => {
      try {
        const updated = await patchInvoice({ baseAmount: amount });
        setInvoice(updated);
        router.refresh();
      } catch (e: unknown) {
        setLabourError((e as Error).message);
      }
    });
  }

  function saveNotes() {
    setNotesError(null);
    startNotesTransition(async () => {
      try {
        const updated = await patchInvoice({ notes: notes || null });
        setInvoice(updated);
        router.refresh();
      } catch (e: unknown) {
        setNotesError((e as Error).message);
      }
    });
  }

  function sendInvoice() {
    if (!sendEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sendEmail)) {
      setSendError("Enter a valid email address.");
      return;
    }
    setSendError(null);
    startSendTransition(async () => {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sendEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setSendError(data.error ?? "Failed to send."); return; }
      setInvoice((prev) => ({ ...prev, status: "sent", sentAt: data.sentAt, sentToEmail: data.sentToEmail }));
      router.refresh();
    });
  }

  function markPaid() {
    setPayError(null);
    startPayTransition(async () => {
      try {
        const updated = await patchInvoice({ status: "paid" });
        setInvoice(updated);
        router.refresh();
      } catch (e: unknown) {
        setPayError((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-semibold font-mono">
            {invoice.invoiceNumber ?? "Draft Invoice"}
          </h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[invoice.status]}`}>
            {invoice.status}
          </span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {job.customerName} — {job.siteName}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          Created {new Date(invoice.createdAt).toLocaleDateString("en-AU")}
        </p>
      </div>

      {/* Labour amount */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Labour amount</h2>
          <div className="flex gap-1 text-xs">
            {(["direct", "calculator"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setLabourMode(mode)}
                className={`px-3 py-1 rounded-lg border transition-colors ${
                  labourMode === mode
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                }`}
              >
                {mode === "direct" ? "Direct $" : "Calculator"}
              </button>
            ))}
          </div>
        </div>

        {labourMode === "direct" ? (
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Labour ($)</label>
              <input type="number" inputMode="decimal" min={0} step={0.01} value={baseInput} onChange={(e) => setBaseInput(e.target.value)} placeholder="0.00" className={inp} />
            </div>
            <button onClick={saveLabour} disabled={isSavingLabour} className="min-h-[44px] px-5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40">
              {isSavingLabour ? "Saving…" : "Save"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Actual hours logged: <span className="font-semibold">{job.actualHours}h</span>
            </p>
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Hourly rate ($/hr)</label>
                <input type="number" inputMode="decimal" min={0} step={0.01} value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="145.00" className={inp} />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Calculated total</label>
                <div className="min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 flex items-center text-base font-semibold">
                  {calculatedLabour != null ? `$${calculatedLabour.toFixed(2)}` : "—"}
                </div>
              </div>
            </div>
            {calculatedLabour != null && (
              <button
                onClick={() => { setBaseInput(calculatedLabour.toFixed(2)); setLabourMode("direct"); }}
                className="text-sm text-amber-600 dark:text-amber-400 underline underline-offset-2"
              >
                Use ${calculatedLabour.toFixed(2)} as labour amount →
              </button>
            )}
          </div>
        )}
        {labourError && <p className="text-sm text-red-600">{labourError}</p>}
      </div>

      {/* Line items */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-3">
        <h2 className="text-sm font-semibold">Line items</h2>
        <div className="space-y-2">
          <div className="flex justify-between text-sm py-2 border-b border-slate-100 dark:border-slate-700">
            <span className="text-slate-600 dark:text-slate-400">Labour — {job.jobType}</span>
            <span className="font-medium">${invoice.baseAmount.toFixed(2)}</span>
          </div>
          {variations.map((v) => (
            <div key={v.id} className="flex justify-between text-sm py-2 border-b border-slate-100 dark:border-slate-700">
              <span className="text-slate-600 dark:text-slate-400 mr-4">Variation: {v.description}</span>
              <span className="font-medium shrink-0">${v.costEstimate.toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between text-base font-bold pt-2">
            <span>Total</span>
            <span>${invoice.totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-3">
        <h2 className="text-sm font-semibold">Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Optional notes shown on the invoice…"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm resize-none"
        />
        {notesError && <p className="text-sm text-red-600">{notesError}</p>}
        <button onClick={saveNotes} disabled={isSavingNotes} className="min-h-[40px] px-4 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium disabled:opacity-40">
          {isSavingNotes ? "Saving…" : "Save notes"}
        </button>
      </div>

      {/* Send panel */}
      {invoice.status !== "paid" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 space-y-4">
          <h2 className="text-sm font-semibold">Send invoice</h2>
          {invoice.sentAt && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Last sent to <span className="font-medium">{invoice.sentToEmail}</span> on {new Date(invoice.sentAt).toLocaleString("en-AU")}
            </p>
          )}
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Customer email</label>
              <input type="email" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} placeholder="customer@example.com" className={inp} />
            </div>
            <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 min-h-[44px] px-4 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0">
              <ExternalLink className="w-4 h-4" />
              Preview PDF
            </a>
            <button onClick={sendInvoice} disabled={isSending} className="min-h-[44px] px-5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm disabled:opacity-40 shrink-0">
              {isSending ? "Sending…" : invoice.sentAt ? "Re-send" : "Send invoice"}
            </button>
          </div>
          {sendError && <p className="text-sm text-red-600">{sendError}</p>}
        </div>
      )}

      {/* Mark as paid — director only, shown when sent */}
      {invoice.status === "sent" && userRole === "director" && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Mark as paid</h2>
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            Confirm payment has been received for {invoice.invoiceNumber ?? "this invoice"}.
          </p>
          {payError && <p className="text-sm text-red-600">{payError}</p>}
          <button onClick={markPaid} disabled={isPaying} className="min-h-[44px] px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-40">
            {isPaying ? "Updating…" : "Mark as paid"}
          </button>
        </div>
      )}

      {/* Paid confirmation */}
      {invoice.status === "paid" && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-5">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            ✓ Paid {invoice.paidAt ? `on ${new Date(invoice.paidAt).toLocaleDateString("en-AU")}` : ""}
          </p>
        </div>
      )}

      {/* Back link */}
      <Link href="/invoices" className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline underline-offset-2">
        ← Back to invoices
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Run full suite**

```bash
pnpm vitest run
```

Expected: 149 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/invoices/[id]/
git commit -m "feat: add invoice detail page with labour calculator, line items, send and mark-paid"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `InvoiceStatus` enum (`draft/sent/paid`) | Task 1 |
| `Invoice.invoiceNumber`, `status`, `notes`, `sentAt`, `sentToEmail`, `paidAt`, `updatedAt` | Task 1 |
| `BusinessProfile.hourlyRate`, `paymentTerms` | Task 1 |
| Invoice number format `INV-YYYY-NNNN`, generated on first PATCH | Task 3 |
| `generateInvoicePdf` with A4 layout, logo, line items, total, payment terms | Task 2 |
| `sendInvoiceEmail` via Resend with PDF attachment | Task 2 |
| `GET /api/invoices` — list, 401 for non-admin/director | Task 3 |
| `GET /api/invoices/[id]` — full detail with variations | Task 3 |
| `PATCH /api/invoices/[id]` — baseAmount, notes, paid (director only) | Task 3 |
| `POST /api/invoices/[id]/send` — email validation (422), calls Resend, updates status | Task 3 |
| `GET /api/invoices/[id]/pdf` — returns `application/pdf` | Task 3 |
| Settings: hourly rate + payment terms fields | Task 4 |
| `/invoices` list with status tabs (All/Draft/Sent/Paid) | Task 5 |
| Nav item `Invoices` visible to `admin` + `director` | Task 5 |
| `/invoices/[id]` detail: direct/calculator labour toggle, line items, send panel, mark paid (director only) | Task 6 |
| 9 API tests covering auth, totalAmount recalc, invoiceNumber gen, paid-403, paidAt, email-422, sendEmail call, PDF content-type | Task 3 |
| 4 lib smoke tests (PDF returns Buffer, no throw on empty variations, Resend called) | Task 2 |

**Placeholder scan:** No TBDs or incomplete sections found.

**Type consistency:** `InvoicePdfData`, `SendInvoiceEmailOpts` defined in Task 2 and consumed in Task 3. `InvoiceRow` defined in Task 5 and `Invoice`/`InvoiceDetail` props in Task 6 all derive from the same API response shape. ✓
