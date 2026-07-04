# Phase 2d — Invoicing Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A complete native invoicing workflow — view invoices per job, set the labour amount, generate a PDF invoice, send it to the customer by email, and track payment status through to paid.

**Architecture:** New `/invoices` page, invoice detail page, PDF generator, and email send via Resend. Schema extensions to `Invoice`. Hourly rate added to BusinessProfile/Settings for the labour calculator.

**Tech Stack:** Next.js 14 App Router, Prisma 7 + Neon, `@react-pdf/renderer` (PDF), Resend (transactional email).

**Dependency:** Module 2e (Customers) should be implemented first so that `job.customer.email` can pre-fill the send screen. If 2e is not yet built, the email field falls back to a free-text input.

---

## Global Constraints

- Roles with full access: `admin`, `director`
- Only `director` can mark an invoice as paid
- Only `admin` can set base amount and send invoices
- `technician`, `sales_engineer`, `draftsman`, `service_manager` have no access to invoices
- Invoice numbers are sequential and never reused
- PDF must render within 5 seconds
- Email delivery via Resend — do not implement SMTP directly

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

### Changes to `Invoice` model

```prisma
model Invoice {
  id              String        @id @default(uuid())
  jobId           String
  invoiceNumber   String        @unique   // e.g. "INV-2026-0001"
  status          InvoiceStatus @default(draft)
  baseAmount      Float         @default(0)
  variationsTotal Float         @default(0)
  totalAmount     Float         @default(0)
  notes           String?
  sentAt          DateTime?
  sentToEmail     String?       // who it was sent to (audit)
  paidAt          DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  job Job @relation(fields: [jobId], references: [id])
}
```

**Migration name:** `invoice_status_and_number`

### Changes to `BusinessProfile` model

Add two optional fields for invoicing:

```prisma
hourlyRate    Float?   // used by labour calculator
paymentTerms  String?  // shown on PDF, e.g. "Payment due 14 days from invoice date"
```

**Migration name:** included in `invoice_status_and_number` migration.

### Invoice number generation

Generated server-side when the invoice record is first created, inside a Prisma transaction to avoid duplicates:

```typescript
const count = await tx.invoice.count();
const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
```

**Backfill:** existing invoices (created by variation approval) get `invoiceNumber` generated on first save. The migration sets `invoiceNumber` to `NULL` initially; the application populates it on first PATCH.

---

## 2. Settings Page Addition

Add two fields to `src/app/settings/SettingsForm.tsx` and `src/app/api/settings/route.ts`:

- **Hourly rate** — number input (e.g. `$145.00`), optional, used to pre-fill the invoice labour calculator
- **Payment terms** — text input (e.g. "Payment due 14 days from invoice date"), shown in PDF footer

The `updateSchema` in `/api/settings/route.ts` adds:

```typescript
hourlyRate:   z.number().positive().nullable().optional(),
paymentTerms: z.string().max(200).optional(),
```

---

## 3. API Routes

### `GET /api/invoices`

**Auth:** `requireRole(["admin", "director"])`

Returns all invoices with job info, ordered by `createdAt desc`. Response per invoice:

```typescript
{
  id, invoiceNumber, status, baseAmount, variationsTotal, totalAmount,
  sentAt, paidAt, createdAt,
  job: { id, customerName, siteName, jobType }
}
```

### `GET /api/invoices/[id]`

**Auth:** `requireRole(["admin", "director"])`

Returns full invoice including all approved variations as line items:

```typescript
{
  ...invoice fields,
  job: { id, customerName, siteName, siteAddress, jobType,
         customer: { name, email, address, abn } | null,
         timeEntries: [{ durationMinutes }],    // for labour calculator display
  },
  variations: [{ id, description, costEstimate, decidedAt }]   // approved only
}
```

### `PATCH /api/invoices/[id]`

**Auth:** `requireRole(["admin", "director"])`

Accepts partial updates. Admin fields: `baseAmount`, `notes`. Director-only field: when `status: "paid"` is sent, sets `paidAt = now()` and transitions status.

Recalculates `totalAmount = baseAmount + variationsTotal` on every save.

If `invoiceNumber` is currently null, generates and sets it in this call.

### `POST /api/invoices/[id]/send`

**Auth:** `requireRole(["admin", "director"])`

**Body:** `{ email: string }`

Steps:
1. Validates email format
2. Fetches full invoice + job + business profile (name, logo, payment terms)
3. Calls `generateInvoicePdf()` → `Buffer`
4. Sends email via Resend with PDF attached
5. Updates invoice: `status = "sent"`, `sentAt = now()`, `sentToEmail = email`
6. Returns `{ sentAt, sentToEmail }`

### `GET /api/invoices/[id]/pdf`

**Auth:** `requireRole(["admin", "director"])`

Generates and returns the invoice PDF inline (for preview before sending).

---

## 4. PDF Generator

**File:** `src/lib/invoicing/generateInvoicePdf.ts`

```typescript
export interface GenerateInvoicePdfArgs {
  invoice: Invoice;
  variations: Variation[];              // approved variations — fetched from job.variations; NOT a relation on Invoice
  job: Job & { customer?: Customer | null };
  businessProfile: BusinessProfile;
}
export async function generateInvoicePdf(args: GenerateInvoicePdfArgs): Promise<Buffer>
```

**PDF layout (A4):**

```
[Logo]  CT Field Ops                          INVOICE
        ABN: xx xxx xxx xxx                   INV-2026-0001
                                              Date: 04/07/2026

Bill To:
  Rio Tinto — Weipa Site
  123 Mine Rd, Weipa QLD 4874

─────────────────────────────────────────────────────────
Description                                       Amount
─────────────────────────────────────────────────────────
Labour — Breakdown service (12.5 hrs)           $1,812.50
Variation: Replace dosing pump                    $950.00
Variation: After-hours call-out fee               $450.00
─────────────────────────────────────────────────────────
                                     Total:     $3,212.50

Payment due 14 days from invoice date.
Bank: ANZ  BSB: 012-345  Account: 1234 5678
─────────────────────────────────────────────────────────
```

Uses same `@react-pdf/renderer` style as compliance PDFs. Business name, logo, ABN from `BusinessProfile`. Payment terms from `BusinessProfile.paymentTerms`.

---

## 5. Email Template (Resend)

**File:** `src/lib/invoicing/sendInvoiceEmail.ts`

```typescript
export async function sendInvoiceEmail(opts: {
  to: string;
  invoiceNumber: string;
  jobDescription: string;   // e.g. "Breakdown — Weipa"
  totalAmount: number;
  pdfBuffer: Buffer;
  businessName: string;
}): Promise<void>
```

Uses Resend's `attachments` field to attach the PDF. Plain HTML body: "Please find attached invoice {number} for {job}. Total: ${amount}."

**Environment variable required:** `RESEND_API_KEY`

---

## 6. Pages

### `/invoices` — Invoice list

**File:** `src/app/invoices/page.tsx` (server) + `src/app/invoices/InvoiceList.tsx` (client for status filter)

**Access guard:** `requireRole(["admin", "director"])` with `redirect("/")` on fail.

Displays a table of invoices grouped by status. Status filter tabs: All | Draft | Sent | Paid. Each row shows: invoice number, customer/site, total amount, status badge, date. Clicking a row navigates to `/invoices/[id]`.

### `/invoices/[id]` — Invoice detail

**File:** `src/app/invoices/[id]/page.tsx` (server component)

Sections:

**Header:** Invoice number, status badge, job name, created date.

**Labour amount:**
- Two-mode input (toggle between modes):
  - *Direct entry*: number input for `baseAmount`
  - *Calculator*: shows `actual hours × hourly rate = $X`, with editable rate field (pre-filled from BusinessProfile.hourlyRate). Clicking "Use this amount" fills `baseAmount`.
- "Save" button PATCHes `/api/invoices/[id]`

**Line items (read-only display):**
- Labour: `$baseAmount`
- Each approved variation: description + `$costEstimate`
- Total row

**Send invoice panel** (shown when status is `draft` or `sent`):
- Email input — pre-filled from `job.customer.email` if available
- "Preview PDF ↗" link — opens `/api/invoices/[id]/pdf` in new tab
- "Send invoice" button → POST `/api/invoices/[id]/send`
- Shows `sentAt` and `sentToEmail` after sending

**Mark as paid** (director only, shown when status is `sent`):
- "Mark as paid" button → PATCH `{ status: "paid" }`

### Navigation

Add "Invoices" to `src/lib/nav-config.ts`:

```typescript
{
  label: "Invoices",
  href: "/invoices",
  icon: Receipt,      // lucide-react
  description: "Invoice management and sending",
  visibleTo: ["admin", "director"],
  phase: "2",
}
```

---

## 7. Testing

**Test file:** `src/app/api/invoices/__tests__/invoices.test.ts`

Cover:
- `GET /api/invoices` returns 401 for technician
- `PATCH /api/invoices/[id]` recalculates `totalAmount` correctly
- `PATCH /api/invoices/[id]` with `status: "paid"` sets `paidAt`; rejected for `admin` role (director only)
- `POST /api/invoices/[id]/send` returns 422 for invalid email
- Invoice number is generated on first PATCH if null
- `generateInvoicePdf` renders without throwing (smoke test with mock data)
- `sendInvoiceEmail` calls Resend with correct attachment

Mock: `db.invoice`, `db.businessProfile`, Resend client, `generateInvoicePdf`.
