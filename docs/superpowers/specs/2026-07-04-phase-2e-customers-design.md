# Phase 2e — Customer / Contact Records Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain `customerName` string on jobs with reusable customer records — so that customer contact details (especially email) can be stored once and used across jobs and invoices.

**Architecture:** New `Customer` model linked optionally to `Job`. Customer CRUD pages for admins. Job creation form gets a search-and-select customer input (falls back to free-text for one-off jobs).

**Tech Stack:** Next.js 14 App Router, Prisma 7 + Neon.

**Dependency:** Phase 2d (Invoicing) benefits from 2e being complete, since `job.customer.email` pre-fills the invoice send screen. 2e can be built independently.

---

## Global Constraints

- Existing jobs are **not affected** — `customerId` is nullable; `customerName` stays as-is
- Only `admin` can create/edit/delete customer records
- `director`, `sales_engineer` can view the customer list and customer details
- `technician`, `draftsman`, `service_manager` have no access to the customer section
- When a job is linked to a customer, `job.customerName` is kept in sync with `customer.name` for display consistency

---

## 1. Schema Changes

### New `Customer` model

```prisma
model Customer {
  id            String   @id @default(uuid())
  name          String
  abn           String?
  contactPerson String?
  email         String?
  phone         String?
  address       String?
  notes         String?  // access instructions, parking, site-specific notes
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  jobs Job[]

  @@index([name])
}
```

### Change to `Job` model

Add optional FK to `Customer`. Existing jobs have `customerId = null`:

```prisma
model Job {
  // ... existing fields ...
  customerId String?

  customer Customer? @relation(fields: [customerId], references: [id])
}
```

**Migration name:** `add_customer_model`

---

## 2. API Routes

### `GET /api/customers`

**Auth:** `requireRole(["admin", "director", "sales_engineer"])`

**Query params:** `q` (free-text search on `name`, optional).

Returns list of customers ordered by `name asc`:

```typescript
{ id: string; name: string; email: string | null; phone: string | null; abn: string | null }[]
```

This endpoint is also used by the job creation form's customer search autocomplete.

### `POST /api/customers`

**Auth:** `requireRole(["admin"])`

**Body:**

```typescript
{
  name:          string;    // required, min 2 chars
  abn?:          string;
  contactPerson?: string;
  email?:        string;    // validated as email if provided
  phone?:        string;
  address?:      string;
  notes?:        string;
}
```

### `GET /api/customers/[id]`

**Auth:** `requireRole(["admin", "director", "sales_engineer"])`

Returns full customer record plus linked jobs:

```typescript
{
  ...customer fields,
  jobs: { id, customerName, siteName, status, createdAt, jobType }[]
}
```

### `PATCH /api/customers/[id]`

**Auth:** `requireRole(["admin"])`

Accepts any subset of the customer fields. When `name` is updated, also updates `customerName` on all linked jobs in the same transaction.

### `DELETE /api/customers/[id]`

**Auth:** `requireRole(["admin"])`

Soft approach: sets `customerId = null` on all linked jobs (they keep their `customerName`), then deletes the customer record. Returns 204.

---

## 3. Job Integration

### `POST /api/jobs` (update existing)

Add optional `customerId` field to `createJobSchema`:

```typescript
customerId: z.string().uuid().optional(),
```

If `customerId` is provided, fetch the customer and use `customer.name` as `customerName`.

### Job creation form (`src/app/jobs/NewJobForm.tsx`) — update

Replace the plain `customerName` text input with a **search-and-select** component:

**Behaviour:**
1. User types in the customer name field
2. After 2+ chars, fetches `GET /api/customers?q={input}` and shows a dropdown of matches
3. User selects a customer → `customerId` is set, `customerName` is auto-filled from customer record (read-only)
4. User can click "✕ Clear" to deselect and return to free-text mode (`customerId = null`)
5. If no match found and user leaves the field with a typed value → job saves with `customerName = typed value` and `customerId = null`

This means all existing job creation still works — it's a progressive enhancement.

---

## 4. Pages

### `/customers` — Customer list

**File:** `src/app/customers/page.tsx` (server component)

**Access guard:** `requireRole(["admin", "director", "sales_engineer"])` with `redirect("/")` on fail.

Displays a searchable list of customers. Each row: name, ABN, contact person, email, phone, job count. "New customer" button (admin only). Click row → `/customers/[id]`.

### `/customers/new` — Create customer

**File:** `src/app/customers/new/page.tsx`

**Access guard:** `requireRole(["admin"])`.

Form with all customer fields. `POST /api/customers` on submit. Redirects to `/customers/[id]` on success.

### `/customers/[id]` — Customer detail

**File:** `src/app/customers/[id]/page.tsx` (server component)

Sections:
- **Contact details** — all customer fields, inline edit (admin only)
- **Notes** — large text area shown separately (access instructions, site notes)
- **Linked jobs** — table of all jobs linked to this customer, with status and date

Inline edit: "Edit" button toggles the contact details section to an editable form. `PATCH /api/customers/[id]` on save.

---

## 5. Navigation

Add "Customers" to `src/lib/nav-config.ts`:

```typescript
{
  label: "Customers",
  href: "/customers",
  icon: Building2,    // lucide-react
  description: "Customer contacts and linked jobs",
  visibleTo: ["admin", "director", "sales_engineer"],
  phase: "2",
}
```

---

## 6. Testing

**Test file:** `src/app/api/customers/__tests__/customers.test.ts`

Cover:
- `GET /api/customers` returns 401 for technician
- `GET /api/customers?q=rio` filters by name case-insensitively
- `POST /api/customers` creates customer; returns 400 for missing name
- `PATCH /api/customers/[id]` updates customer; syncs `customerName` on linked jobs
- `DELETE /api/customers/[id]` nullifies `customerId` on linked jobs before deleting
- `POST /api/jobs` with `customerId` auto-fills `customerName` from customer record

Mock: `db.customer`, `db.job`, `requireRole`.
