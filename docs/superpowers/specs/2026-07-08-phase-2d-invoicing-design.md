# Phase 2d — Invoicing Design

**Goal:** A complete native invoicing workflow — view invoices per job, set the labour amount, generate a PDF invoice, send it to the customer by email via Resend, and track payment status through to paid.

**Architecture:** Schema extension to `Invoice` and `BusinessProfile`, new `/invoices` list and detail pages, PDF generator via `@react-pdf/renderer`, email send via Resend, settings additions for hourly rate and payment terms.

**Tech Stack:** Next.js 14 App Router, Prisma 7 + Neon, `@react-pdf/renderer` (already installed), Resend (new dependency).

**Existing state:** `Invoice` model already exists (created by variation approval flow). It has `id`, `jobId @unique`, `baseAmount Decimal`, `variationsTotal Decimal`, `totalAmount Decimal`, `createdAt`. This migration extends it — existing records are not deleted.

---

## Global Constraints

- Roles with full access: `admin`, `director`
- Only `director` can mark an invoice as paid
- `technician`, `sales_engineer`, `draftsman`, `service_manager` have no access
- Invoice numbers are sequential, never reused, format `INV-YYYY-NNNN`
- Amounts stored as `Decimal @db.Decimal(12, 2)` — consistent with existing Invoice fields
- PDF must render within 5 seconds
- Email delivery via Resend — `RESEND_API_KEY` environment variable required

---

## 1. Schema Changes

### New enum

```prisma
enum InvoiceStatus {
  draft
  sent
  paid
}
```

### Extended `Invoice` model

```prisma
model Invoice {
  id              String        @id @default(uuid())
  jobId           String        @unique
  invoiceNumber   String?       @unique   // null on existing records; set on first PATCH
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

  @@index([status])
}
```

### Extended `BusinessProfile` model

Add two optional fields:

```prisma
model BusinessProfile {
  // ... existing fields ...
  hourlyRate    Float?    // pre-fills the labour calculator
  paymentTerms  String?   // shown in PDF footer, e.g. "Payment due 14 days from invoice date"
}
```

**Migration name:** `invoice_v2`

**Migration SQL must:**
1. Add `invoiceNumber TEXT UNIQUE` (nullable — existing rows get null)
2. Add `status TEXT NOT NULL DEFAULT 'draft'`
3. Add `notes TEXT`
4. Add `sentAt TIMESTAMPTZ`, `sentToEmail TEXT`, `paidAt TIMESTAMPTZ`
5. Add `updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()`
6. Add `hourlyRate FLOAT` and `paymentTerms TEXT` to `BusinessProfile`
7. Create index on `Invoice.status`

---

## 2. Invoice Number Generation

Generated server-side in a Prisma transaction on first PATCH (when `invoiceNumber` is currently null):

```typescript
const count = await tx.invoice.count();
const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
await tx.invoice.update({ where: { id }, data: { invoiceNumber, ...otherFields } });
```

The count-based approach is safe because we're inside a transaction and invoice records are created one at a time.

---

## 3. Settings Page Addition

**File:** `src/app/settings/SettingsForm.tsx` and `src/app/api/settings/route.ts`

Add to the existing settings form (below existing fields):

- **Hourly rate** — `<input type="number">` labelled "Hourly rate ($)", optional
- **Payment terms** — `<input type="text">` labelled "Payment terms", optional, e.g. "Payment due 14 days from invoice date"

Add to `updateSchema` in `/api/settings/route.ts`:

```typescript
hourlyRate:   z.number().positive().nullable().optional(),
paymentTerms: z.string().max(200).optional(),
```

`BusinessProfile` returned from `GET /api/settings` must include these two new fields.

---

## 4. API Routes

### `GET /api/invoices`

**Auth:** `requireRole(["admin", "director"])`

Returns all invoices ordered by `createdAt desc`. Per-invoice response:

```typescript
{
  id: string;
  invoiceNumber: string | null;
  status: "draft" | "sent" | "paid";
  baseAmount: number;
  variationsTotal: number;
  totalAmount: number;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
  job: { id: string; customerName: string; siteName: string; jobType: string };
}
```

### `GET /api/invoices/[id]`

**Auth:** `requireRole(["admin", "director"])`

Full invoice with job details and approved variation line items:

```typescript
{
  // all Invoice fields
  job: {
    id: string; customerName: string; siteName: string;
    siteAddress: string; jobType: string;
    timeEntries: { durationMinutes: number | null }[];  // complete only
  };
  variations: { id: string; description: string; costEstimate: number; decidedAt: string | null }[];
}
```

Variations are fetched from `job.variations` (status `approved`), not a direct Invoice relation.

### `PATCH /api/invoices/[id]`

**Auth:** `requireRole(["admin", "director"])`

```typescript
// Accepted body fields:
{
  baseAmount?: number;   // recalculates totalAmount = baseAmount + variationsTotal
  notes?: string | null;
  status?: "paid";       // director only — also sets paidAt = now()
}
```

On every save:
- `totalAmount = baseAmount + variationsTotal`
- If `invoiceNumber` is null, generate and set it (see §2)
- If `status === "paid"` and role is not `director` → 403

Response: full updated invoice (same shape as GET /api/invoices/[id]).

### `POST /api/invoices/[id]/send`

**Auth:** `requireRole(["admin", "director"])`

**Body:** `{ email: string }`

Steps:
1. Validate email (`z.string().email()`) → 422 on failure
2. Fetch full invoice + job + business profile
3. Fetch approved variations from `job.variations`
4. Ensure `invoiceNumber` is set (generate if null)
5. Call `generateInvoicePdf()` → `Buffer`
6. Call `sendInvoiceEmail()` via Resend
7. PATCH invoice: `status = "sent"`, `sentAt = now()`, `sentToEmail = email`
8. Return `{ sentAt, sentToEmail }`

### `GET /api/invoices/[id]/pdf`

**Auth:** `requireRole(["admin", "director"])`

Calls `generateInvoicePdf()` and returns response with:
- `Content-Type: application/pdf`
- `Content-Disposition: inline; filename="INV-XXXX.pdf"`

---

## 5. PDF Generator

**File:** `src/lib/invoicing/generateInvoicePdf.ts`

```typescript
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
    name: string; abn: string; address: string; logoUrl?: string | null; paymentTerms?: string | null;
  };
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer>
```

**PDF layout (A4):**

```
[Logo]  {businessName}                        INVOICE
        ABN: {abn}                            {invoiceNumber}
        {address}                             Date: {createdAt dd/mm/yyyy}

Bill To:
  {customerName}
  {siteName}
  {siteAddress}

─────────────────────────────────────────────────────────
Description                                       Amount
─────────────────────────────────────────────────────────
Labour — {jobType}                              ${baseAmount}
Variation: {description}                         ${costEstimate}   (one row per variation)
─────────────────────────────────────────────────────────
                                    Total:     ${totalAmount}

{paymentTerms}
─────────────────────────────────────────────────────────
Generated {timestamp}
```

Uses `@react-pdf/renderer`. Logo fetched from `logoUrl` as base64 if set. Same rendering approach as existing compliance PDF generator in `src/lib/compliance/`.

---

## 6. Email

**File:** `src/lib/invoicing/sendInvoiceEmail.ts`

```typescript
export async function sendInvoiceEmail(opts: {
  to: string;
  invoiceNumber: string;
  jobDescription: string;   // e.g. "Annual Service — Weipa Plant"
  totalAmount: number;
  pdfBuffer: Buffer;
  businessName: string;
}): Promise<void>
```

Uses Resend SDK (`import { Resend } from "resend"`). Plain HTML body. PDF attached as `application/pdf`.

**Environment variable:** `RESEND_API_KEY` — must be added to Vercel project settings.

---

## 7. Pages

### `/invoices` — Invoice list (`src/app/invoices/page.tsx` + `InvoiceList.tsx`)

**Server component** does auth guard + data fetch. **Client component** handles status tab state.

Status tabs: All | Draft | Sent | Paid — filter the already-fetched list client-side (no extra API call).

Each row shows: invoice number (or "—"), customer — site, job type, total amount, status badge (grey=draft, amber=sent, green=paid), date. Clicking a row navigates to `/invoices/[id]`.

### `/invoices/[id]` — Invoice detail (`src/app/invoices/[id]/page.tsx` + `InvoiceDetail.tsx`)

**Server component** fetches invoice + job + variations + business profile. Passes everything to the client component.

**Sections:**

1. **Header** — invoice number, status badge, `{customerName} — {siteName}`, created date

2. **Labour** — two-mode toggle:
   - *Direct*: number input for `baseAmount`
   - *Calculator*: shows `{actualHours} hrs × $rate/hr = $total`; rate pre-filled from `businessProfile.hourlyRate`; editable; "Use this amount" button fills the direct input
   - "Save" button → `PATCH /api/invoices/[id]` with `{ baseAmount }`

3. **Line items** (read-only):
   - Labour: `${baseAmount}`
   - Each variation: description + `$costEstimate`
   - **Total: `${totalAmount}`**

4. **Notes** — textarea, "Save notes" button

5. **Send panel** (shown when `status !== "paid"`):
   - Email input (free-text; no customer model yet)
   - "Preview PDF ↗" — opens `/api/invoices/[id]/pdf` in new tab
   - "Send invoice" button → `POST /api/invoices/[id]/send`
   - After send: shows "Sent to {email} on {date}"

6. **Mark as paid** (director only, shown when `status === "sent"`):
   - "Mark as paid" button → `PATCH /api/invoices/[id]` `{ status: "paid" }`

### Navigation

Add to `src/lib/nav-config.ts`:

```typescript
{
  label: "Invoices",
  href: "/invoices",
  icon: Receipt,        // lucide-react
  description: "Invoice management and sending",
  visibleTo: ["admin", "director"],
  phase: "2",
}
```

Also extend `NavItem.phase` union: `"1a" | "1b" | "1c" | "2" | "2b" | "3"` → already has `"2"` so no change needed.

---

## 8. File Structure

**New files:**
- `src/app/api/invoices/route.ts`
- `src/app/api/invoices/[id]/route.ts`
- `src/app/api/invoices/[id]/send/route.ts`
- `src/app/api/invoices/[id]/pdf/route.ts`
- `src/app/api/invoices/__tests__/invoices.test.ts`
- `src/app/invoices/page.tsx`
- `src/app/invoices/InvoiceList.tsx`
- `src/app/invoices/[id]/page.tsx`
- `src/app/invoices/[id]/InvoiceDetail.tsx`
- `src/lib/invoicing/generateInvoicePdf.ts`
- `src/lib/invoicing/sendInvoiceEmail.ts`
- `prisma/migrations/[timestamp]_invoice_v2/migration.sql`

**Modified files:**
- `prisma/schema.prisma` — add `InvoiceStatus` enum, extend `Invoice` and `BusinessProfile`
- `src/app/settings/SettingsForm.tsx` — add hourly rate + payment terms fields
- `src/app/api/settings/route.ts` — extend schema and GET response
- `src/lib/nav-config.ts` — add Invoices nav item

---

## 9. Testing

**Test file:** `src/app/api/invoices/__tests__/invoices.test.ts`

Cover:
1. `GET /api/invoices` returns 401 for `technician`
2. `GET /api/invoices` returns 401 for `service_manager`
3. `PATCH /api/invoices/[id]` recalculates `totalAmount = baseAmount + variationsTotal`
4. `PATCH /api/invoices/[id]` generates `invoiceNumber` when null (format: `INV-YYYY-NNNN`)
5. `PATCH /api/invoices/[id]` with `status: "paid"` returns 403 for `admin` role
6. `PATCH /api/invoices/[id]` with `status: "paid"` sets `paidAt` for `director` role
7. `POST /api/invoices/[id]/send` returns 422 for invalid email
8. `POST /api/invoices/[id]/send` calls `sendInvoiceEmail` with correct args (mock)
9. `GET /api/invoices/[id]/pdf` returns `application/pdf` content type (smoke test with mocked `generateInvoicePdf`)

Mock: `db.invoice`, `db.job`, `db.businessProfile`, `requireRole`, `generateInvoicePdf`, `sendInvoiceEmail`.
