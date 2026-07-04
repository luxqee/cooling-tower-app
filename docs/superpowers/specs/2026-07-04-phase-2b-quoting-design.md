# Phase 2b — Quoting from Historical Job Data Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only quoting tool for sales engineers to search completed jobs, compare actual-vs-quoted hours, and export summaries to inform quotes for new work.

**Architecture:** New `/quoting` page (server component for data, client component for search interactions), three API routes under `/api/quoting/`, one schema migration adding `jobType` to `Job`. No new DB tables.

**Tech Stack:** Next.js 14 App Router, Prisma 7 + Neon, `@react-pdf/renderer` (PDF export), `text/csv` response (CSV export).

---

## Global Constraints

- Sales engineers must never see individual technician names anywhere in this module
- Only `complete` status jobs are returned in search results
- Roles with access: `sales_engineer`, `director`, `admin`
- Roles blocked: `technician`, `draftsman`, `service_manager`
- Queries must return in under 3 seconds — add DB indexes on `status` (already exists) and `jobType` (new)

---

## 1. Schema Changes

### New enum

```prisma
enum JobType {
  routine_service
  breakdown
  major_works
}
```

### Change to `Job` model

Add one nullable column (existing jobs keep `null`; new jobs should be tagged going forward):

```prisma
model Job {
  // ... existing fields ...
  jobType JobType?
}
```

**Migration name:** `add_job_type`

**Index:** `@@index([jobType])` on the `Job` model.

### Job create/edit form

Add an optional "Job type" dropdown to `NewJobForm.tsx` and the `POST /api/jobs` route:
- Options: `— Not specified —` (null), `Routine service`, `Breakdown`, `Major works`
- Not required (nullable) — old jobs are unaffected
- Validation: if provided, must be one of the three enum values
- The `createJobSchema` in `/api/jobs/route.ts` adds `jobType: z.enum(["routine_service", "breakdown", "major_works"]).nullable().optional()`

---

## 2. API Routes

### `GET /api/quoting/search`

**Auth:** `requireRole(["sales_engineer", "director", "admin"])`

**Query params:**
- `q` — free-text search term (searches `customerName` and `siteName`, case-insensitive). Empty string returns all.
- `jobType` — one of `routine_service | breakdown | major_works | ""` (empty = all)
- `page` — integer, default 1
- `pageSize` — always 20

**Prisma query:**

```typescript
const jobs = await db.job.findMany({
  where: {
    status: "complete",
    ...(jobType ? { jobType } : {}),
    ...(q ? {
      OR: [
        { customerName: { contains: q, mode: "insensitive" } },
        { siteName:     { contains: q, mode: "insensitive" } },
      ]
    } : {}),
  },
  include: {
    timeEntries: { where: { status: "complete" }, select: { durationMinutes: true } },
    variations:  { where: { status: "approved" }, select: { costEstimate: true } },
  },
  orderBy: { createdAt: "desc" },
  skip: (page - 1) * 20,
  take: 20,
});
```

**Response shape per job** (no technician names):

```typescript
{
  id: string;
  customerName: string;
  siteName: string;
  siteAddress: string;
  jobType: "routine_service" | "breakdown" | "major_works" | null;
  quotedHours: number;
  actualHours: number;           // sum(durationMinutes) / 60, rounded to 1dp
  overagePct: number | null;     // ((actual - quoted) / quoted) * 100, null if quotedHours === 0
  approvedVariationCount: number;
  approvedVariationTotal: number; // sum(costEstimate) of approved variations
  createdAt: string;
}
```

**Also returns:** `{ total: number }` for pagination.

### `GET /api/quoting/export/csv`

**Auth:** same as search.

**Query params:** `q`, `jobType` (no pagination — returns all matching rows).

**Response:** `Content-Type: text/csv`, `Content-Disposition: attachment; filename="quote-summary-{date}.csv"`

**CSV columns:**
```
Customer,Site,Address,Job Type,Quoted Hours,Actual Hours,Overage %,Approved Variations,Variation Total ($)
```

Overage % formatted as `+31%` or `-5%` or `—` (if quoted hours is 0). Generated server-side as a string, no external library needed.

### `GET /api/quoting/export/pdf`

**Auth:** same as search.

**Query params:** `q`, `jobType`.

**Response:** `Content-Type: application/pdf`, `Content-Disposition: inline; filename="quote-summary-{date}.pdf"`

New helper `src/lib/quoting/generateQuotingPdf.ts` using `@react-pdf/renderer`. Fetches the business profile (name + logo) and renders a summary table. Same header/footer style as compliance PDFs. Includes search criteria at the top ("Showing: Breakdown jobs matching 'Weipa'").

---

## 3. Page — `/quoting`

**File:** `src/app/quoting/page.tsx` (server component) + `src/app/quoting/QuotingClient.tsx` (client component)

**Access guard:** `requireRole(["sales_engineer", "director", "admin"])` with `redirect("/")` on fail.

### Server component (`page.tsx`)
Renders the AppShell, page heading, and passes no initial data — results are fetched client-side on first search (empty search shows all complete jobs on mount).

### Client component (`QuotingClient.tsx`)

**State:**
- `query: string` — text input value
- `jobType: string` — dropdown value (`""` = all)
- `results: QuotingRow[]`
- `total: number`
- `page: number`
- `loading: boolean`

**Behaviour:**
- On mount: fetch `/api/quoting/search` with empty params to show recent complete jobs
- On "Search" button press: fetch with current `query` + `jobType`, reset to page 1
- Pagination: "Load more" button (appends next page to results)
- "Export CSV" button: `window.location.href = /api/quoting/export/csv?q=...&jobType=...`
- "Export PDF" button: opens in new tab (`target="_blank"`)

**Results table columns:** Customer | Site | Type | Quoted hrs | Actual hrs | Overage | Variations | Var. value

Overage column colour-coded: red if > 0%, green if ≤ 0%, grey if null.

No technician names anywhere.

---

## 4. Navigation

Add "Quoting" to `src/lib/nav-config.ts`:

```typescript
{
  label: "Quoting",
  href: "/quoting",
  icon: Calculator,       // from lucide-react
  description: "Historical job data for quoting",
  visibleTo: ["sales_engineer", "director", "admin"],
  phase: "2",
}
```

---

## 5. PDF Generator

**File:** `src/lib/quoting/generateQuotingPdf.ts`

```typescript
export interface GenerateQuotingPdfArgs {
  rows: QuotingRow[];
  searchCriteria: string;   // human-readable description of applied filters
  businessName?: string;
  logoUrl?: string | null;
}
export async function generateQuotingPdf(args: GenerateQuotingPdfArgs): Promise<Buffer>
```

Renders an A4 PDF with:
- Header: logo (if set) + business name, "Quote Summary" title
- Criteria line: e.g. "Breakdown jobs — all sites"
- Table: same columns as the UI table
- Footer: generation timestamp

Uses same `@react-pdf/renderer` style as `generatePdf.ts`.

---

## 6. Testing

**Test file:** `src/app/api/quoting/__tests__/search.test.ts`

Cover:
- `GET /api/quoting/search` returns 401 for technician role
- Returns 200 with correct aggregate stats (actualHours, overagePct, approvedVariationCount)
- Filters by jobType correctly
- Free-text search filters by customerName and siteName
- Does not include technician names in any response field
- `GET /api/quoting/export/csv` returns `text/csv` content type

Mock: `db.job.findMany`, `requireRole`.
