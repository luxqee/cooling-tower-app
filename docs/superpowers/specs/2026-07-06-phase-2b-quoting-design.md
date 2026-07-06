# Phase 2b — Quoting Tool Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only quoting tool for sales engineers to search completed jobs, compare actual-vs-quoted hours, and view aggregate stats to inform quotes for new work.

**Architecture:** New `/quotes` page (server component for auth guard, client component for search interactions), two API routes under `/api/quotes/`, one schema migration adding `jobType String` to `Job`, and updates to job creation. No new DB tables. No export for Phase 2b.

**Tech Stack:** Next.js 14 App Router, Prisma 7 + Neon, Tailwind CSS, Vitest.

---

## Global Constraints

- Sales engineers must never see individual technician names anywhere in this module
- Only `complete` status jobs are returned in search results
- Roles with access: `sales_engineer`, `director`, `admin`
- Roles blocked: `technician`, `draftsman`, `service_manager`
- `jobType` is a free-text `String` (not a Prisma enum) — directors define types as they create jobs; the UI provides autocomplete from existing DB values
- `jobType` is required on new jobs; existing jobs are backfilled with `"Unclassified"` in the migration
- Max 50 results returned per search (no pagination)
- No export (CSV or PDF) in Phase 2b — deferred

---

## 1. Schema Changes

### Change to `Job` model in `prisma/schema.prisma`

Add one non-nullable `String` column and an index:

```prisma
model Job {
  // ... existing fields ...
  jobType  String

  // ... existing relations ...

  @@index([status])
  @@index([jobType])    // new
}
```

### Migration

Migration name: `add_job_type`

**Important:** Prisma cannot safely auto-generate the migration for a NOT NULL column on an existing table. The implementer must:
1. Add `jobType String` to `schema.prisma` (as shown above)
2. Run `npx prisma migrate dev --create-only --name add_job_type` — this creates the migration file without applying it
3. Replace the auto-generated SQL in the migration file with the custom SQL below
4. Run `npx prisma migrate dev` — Prisma applies the custom SQL; the schema and DB are now in sync

The migration SQL must:
1. Add the column as nullable first
2. Backfill all existing rows with `'Unclassified'`
3. Set the column to NOT NULL

```sql
ALTER TABLE "Job" ADD COLUMN "jobType" TEXT;
UPDATE "Job" SET "jobType" = 'Unclassified';
ALTER TABLE "Job" ALTER COLUMN "jobType" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "Job_jobType_idx" ON "Job"("jobType");
```

---

## 2. API Routes

### `GET /api/quotes/job-types`

**File:** `src/app/api/quotes/job-types/route.ts`

**Auth:** `requireRole(["sales_engineer", "director", "admin"])`

**Purpose:** Return distinct job type strings from all completed jobs, for use in the filter autocomplete.

**Prisma query:**

```typescript
const rows = await db.job.groupBy({
  by: ["jobType"],
  where: { status: "complete" },
  orderBy: { jobType: "asc" },
});
```

**Response:** `{ jobTypes: string[] }` — alphabetically sorted list of distinct values.

---

### `GET /api/quotes/search`

**File:** `src/app/api/quotes/search/route.ts`

**Auth:** `requireRole(["sales_engineer", "director", "admin"])`

**Query params:**
- `jobType` — exact match string, or `""` to return all types
- `customerName` — contains filter (case-insensitive), or `""` to skip
- `dateFrom` — ISO date string (`YYYY-MM-DD`), filters `createdAt >= dateFrom`, or omitted
- `dateTo` — ISO date string (`YYYY-MM-DD`), filters `createdAt <= dateTo end-of-day`, or omitted

**Prisma query:**

```typescript
const jobs = await db.job.findMany({
  where: {
    status: "complete",
    ...(jobType ? { jobType } : {}),
    ...(customerName ? { customerName: { contains: customerName, mode: "insensitive" } } : {}),
    ...(dateFrom || dateTo ? {
      createdAt: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
      }
    } : {}),
  },
  include: {
    timeEntries: { where: { status: "complete" }, select: { durationMinutes: true } },
    variations:  { where: { status: "approved" }, select: { costEstimate: true } },
  },
  orderBy: { createdAt: "desc" },
  take: 50,
});
```

**Per-job response shape** (no technician names or IDs):

```typescript
{
  id: string;
  customerName: string;
  siteName: string;
  siteAddress: string;
  jobType: string;
  quotedHours: number;
  actualHours: number;           // sum(durationMinutes) / 60, rounded to 1 decimal place
  overagePct: number | null;     // ((actual - quoted) / quoted) * 100, null if quotedHours === 0
  variationCount: number;        // count of approved variations
  variationTotal: number;        // sum(costEstimate) of approved variations, as number
  createdAt: string;             // ISO string
}
```

**Aggregate stats** (computed server-side across all 50 returned results):

```typescript
stats: {
  avgQuotedHours: number;       // average of quotedHours across returned jobs
  avgActualHours: number;       // average of actualHours across returned jobs
  avgOveragePct:  number | null; // average of overagePct values that are non-null; null if none
  avgVariationTotal: number;    // average of variationTotal across returned jobs
  count: number;                // total number of returned jobs
}
```

**Full response shape:**

```typescript
{
  jobs: QuoteRow[];
  stats: QuoteStats;
}
```

---

## 3. Job Type on Job Create/Edit

### `src/app/api/jobs/route.ts`

Add `jobType` to `createJobSchema`:

```typescript
const createJobSchema = z.object({
  customerName: z.string().min(2, "Customer name required"),
  siteName:     z.string().min(2, "Site name required"),
  siteAddress:  z.string().min(5, "Site address required"),
  quotedHours:  z.number().positive("Quoted hours must be greater than 0"),
  status:       z.enum(["scheduled", "active"]).default("scheduled"),
  jobType:      z.string().min(1, "Job type required"),
});
```

### `src/app/jobs/NewJobForm.tsx`

Add a "Job type" text input with `<datalist>` autocomplete populated from `GET /api/quotes/job-types`.

- Field is required (validation: `min(1)`)
- Default value: `""` (empty — user must fill)
- On form mount: fetch `/api/quotes/job-types` to populate the datalist
- Input: `<input type="text" list="job-type-options" ...>` + `<datalist id="job-type-options">` with an `<option>` for each returned job type
- Error message: "Job type required"

---

## 4. UI — `/quotes` Page

### `src/app/quotes/page.tsx` (server component)

Auth guard: `requireRole(["sales_engineer", "director", "admin"])` — on failure redirect to `"/"`.

Renders `AppShell` with `QuotesClient` inside.

### `src/app/quotes/QuotesClient.tsx` (client component)

**State:**
- `jobType: string` — filter value
- `customerName: string` — filter value
- `dateFrom: string` — filter value
- `dateTo: string` — filter value
- `results: QuoteRow[]`
- `stats: QuoteStats | null`
- `loading: boolean`
- `jobTypes: string[]` — populated from `/api/quotes/job-types` on mount

**Behaviour:**
- On mount: fetch `/api/quotes/search` with empty params to show most-recent 50 complete jobs
- On mount: fetch `/api/quotes/job-types` to populate autocomplete
- "Search" button: fetch with current filter values
- No pagination (max 50 results, no "Load more")

**Layout:**

```
Page heading: "Quotes"

Filter bar (one row):
  [Job type input w/ datalist] [Customer name text input] [Date from (type="date")] [Date to (type="date")] [Search button]

Stats card (shown only when stats.count > 0):
  Avg quoted hrs | Avg actual hrs | Avg overage% | Avg variation total | Job count

Results table (shown only when results.length > 0):
  Customer | Site | Type | Quoted hrs | Actual hrs | Overage | Variation total

Empty state (no results): "No completed jobs match your filters."
```

**Stats card values:**
- "Avg quoted hrs": `stats.avgQuotedHours.toFixed(1)`
- "Avg actual hrs": `stats.avgActualHours.toFixed(1)`
- "Avg overage": `stats.avgOveragePct != null ? (stats.avgOveragePct >= 0 ? "+" : "") + stats.avgOveragePct.toFixed(1) + "%" : "—"`
- "Avg variation total": `"$" + stats.avgVariationTotal.toFixed(2)`
- "Jobs": `stats.count`

**Results table column details:**
- Overage column: text-red-600 if > 0%, text-green-600 if ≤ 0%, text-slate-400 and "—" if null
- Variation total: `"$" + row.variationTotal.toFixed(2)`, grey if 0
- No technician names anywhere

---

## 5. Navigation

Add to `src/lib/nav-config.ts`:

```typescript
{
  label: "Quotes",
  href: "/quotes",
  icon: BarChart2,         // from lucide-react
  description: "Historical job data for quoting",
  visibleTo: ["sales_engineer", "director", "admin"],
  phase: "2b",
}
```

Also extend the `NavItem.phase` union type to include `"2b"`:

```typescript
phase: "1a" | "1b" | "1c" | "2" | "2b" | "3";
```

---

## 6. File Structure

**New files:**
- `src/app/api/quotes/job-types/route.ts`
- `src/app/api/quotes/search/route.ts`
- `src/app/api/quotes/__tests__/search.test.ts`
- `src/app/quotes/page.tsx`
- `src/app/quotes/QuotesClient.tsx`
- `prisma/migrations/[timestamp]_add_job_type/migration.sql` (manually edited — see Section 1 for required SQL)

**Modified files:**
- `prisma/schema.prisma` — add `jobType String`, `@@index([jobType])`
- `src/app/api/jobs/route.ts` — add `jobType` to schema
- `src/app/jobs/NewJobForm.tsx` — add job type field
- `src/lib/nav-config.ts` — add Quotes item, extend phase type

---

## 7. Testing

**Test file:** `src/app/api/quotes/__tests__/search.test.ts`

Tests for `GET /api/quotes/search`:

1. Returns 401 for `technician` role
2. Returns 401 for `draftsman` role
3. Returns 401 for `service_manager` role
4. Returns 200 for `sales_engineer` role
5. `actualHours` is computed correctly: `sum(durationMinutes) / 60`, rounded to 1 dp
6. `overagePct` is null when `quotedHours === 0`
7. `overagePct` is computed correctly when `quotedHours > 0`
8. Filter by `jobType` returns only matching jobs
9. Filter by `customerName` is case-insensitive substring match
10. Response contains no technician IDs or names (no `technicianId`, `userId`, `name`, or `email` fields in any job row)
11. Stats `count` matches number of returned jobs
12. Stats `avgQuotedHours` is the mean of returned jobs' `quotedHours`

Mock: `db.job.findMany`, `db.job.groupBy`, `requireRole`.
