# Phase 2b — Quoting Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `jobType` field to jobs and build a read-only `/quotes` page where sales engineers can search completed jobs, compare actual vs quoted hours, and view aggregate stats.

**Architecture:** Schema migration adds `jobType String` to the `Job` model with a backfill of `"Unclassified"` for existing rows. Two new GET routes under `/api/quotes/`. A server-component page at `/quotes` with a client component for filtering. Job creation is updated to require `jobType` with a datalist autocomplete.

**Tech Stack:** Next.js 14 App Router, Prisma 7 + Neon, Tailwind CSS, Vitest, zod.

## Global Constraints

- Sales engineers must never see individual technician names anywhere in this module
- Only `complete` status jobs appear in search results
- Roles with access: `sales_engineer`, `director`, `admin` — all others get 401
- `jobType` is a free-text `String` (not a Prisma enum) — no enum to create
- `jobType` is required on new jobs (`z.string().min(1, "Job type required")`)
- Existing jobs are backfilled with `"Unclassified"` in the migration
- Max 50 results per search, no pagination, no export

---

## File Map

**New files:**
- `src/app/api/quotes/job-types/route.ts` — GET: distinct job types from completed jobs
- `src/app/api/quotes/search/route.ts` — GET: filtered job list + aggregate stats
- `src/app/api/quotes/__tests__/search.test.ts` — Vitest tests for both routes
- `src/app/quotes/page.tsx` — server component, auth guard, renders AppShell + QuotesClient
- `src/app/quotes/QuotesClient.tsx` — client component, filter bar, stats card, results table

**Modified files:**
- `prisma/schema.prisma` — add `jobType String` + `@@index([jobType])` to Job
- `prisma/migrations/[timestamp]_add_job_type/migration.sql` — custom 3-step SQL
- `src/app/api/jobs/route.ts` — add `jobType` to `createJobSchema`
- `src/app/api/jobs/__tests__/jobs.test.ts` — add `create` to mock + POST tests
- `src/app/jobs/NewJobForm.tsx` — add jobType field with datalist autocomplete
- `src/lib/nav-config.ts` — add Quotes nav entry, extend phase type

---

### Task 1: Schema migration + job creation API update

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/[timestamp]_add_job_type/migration.sql`
- Modify: `src/app/api/jobs/route.ts`
- Modify: `src/app/api/jobs/__tests__/jobs.test.ts`

**Interfaces:**
- Produces: `Job.jobType: String` (non-nullable, DB enforced NOT NULL) — all later tasks rely on this field existing in the Prisma client

- [ ] **Step 1: Update `prisma/schema.prisma`**

Open `prisma/schema.prisma`. Find the `Job` model (currently has `id`, `customerName`, `siteName`, `siteAddress`, `status`, `quotedHours`, `createdAt`, `updatedAt`) and replace it with:

```prisma
model Job {
  id           String    @id @default(uuid())
  customerName String
  siteName     String
  siteAddress  String
  status       JobStatus @default(scheduled)
  quotedHours  Float
  jobType      String
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  assignments         Assignment[]
  timeEntries         TimeEntry[]
  variations          Variation[]
  invoices            Invoice[]
  complianceDocuments ComplianceDocument[]

  @@index([status])
  @@index([jobType])
}
```

- [ ] **Step 2: Create the migration file without applying it**

```bash
npx prisma migrate dev --create-only --name add_job_type
```

This creates a new file at `prisma/migrations/[timestamp]_add_job_type/migration.sql`. The auto-generated SQL will try to add a NOT NULL column directly, which fails on a non-empty table.

- [ ] **Step 3: Replace the migration SQL**

Open the newly created `prisma/migrations/[timestamp]_add_job_type/migration.sql` and replace its entire contents with:

```sql
ALTER TABLE "Job" ADD COLUMN "jobType" TEXT;
UPDATE "Job" SET "jobType" = 'Unclassified';
ALTER TABLE "Job" ALTER COLUMN "jobType" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "Job_jobType_idx" ON "Job"("jobType");
```

- [ ] **Step 4: Apply the migration**

```bash
npx prisma migrate dev
```

Expected: `Your database is now in sync with your schema.` The migration runs the 3-step SQL (add nullable, backfill, set NOT NULL) then regenerates the Prisma client automatically.

- [ ] **Step 5: Write failing tests for POST /api/jobs with jobType**

Open `src/app/api/jobs/__tests__/jobs.test.ts`. Make three changes:

**Change 1** — add `create: vi.fn()` to the db mock (the `job:` object):
```typescript
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { update: vi.fn(), delete: vi.fn(), create: vi.fn() },
  },
}));
```

**Change 2** — add a new import for POST at the top (alongside the existing import):
```typescript
import { POST } from "../route";
```

**Change 3** — add a new describe block at the bottom of the file (after the existing `describe("DELETE /api/jobs/[id]", ...)` block):

```typescript
function makePostReq(body: unknown) {
  return new Request("http://localhost/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validPostBody = {
  customerName: "ACME Corp",
  siteName: "North Tower",
  siteAddress: "123 Main St, Sydney NSW 2000",
  quotedHours: 8,
  jobType: "Installation",
};

describe("POST /api/jobs", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makePostReq(validPostBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 when jobType is missing", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const { jobType: _, ...bodyWithoutJobType } = validPostBody;
    const res = await POST(makePostReq(bodyWithoutJobType));
    expect(res.status).toBe(400);
  });

  it("returns 400 when jobType is empty string", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const res = await POST(makePostReq({ ...validPostBody, jobType: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 when all fields including jobType are provided", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.job.create).mockResolvedValue({
      id: "j1",
      ...validPostBody,
      status: "scheduled",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    const res = await POST(makePostReq(validPostBody));
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 6: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/jobs/__tests__/jobs.test.ts
```

Expected: The 4 new POST tests FAIL (`jobType` not in schema yet). The existing DELETE tests still PASS.

- [ ] **Step 7: Update `src/app/api/jobs/route.ts`**

Replace the entire file:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

const createJobSchema = z.object({
  customerName: z.string().min(2, "Customer name required"),
  siteName:     z.string().min(2, "Site name required"),
  siteAddress:  z.string().min(5, "Site address required"),
  quotedHours:  z.number().positive("Quoted hours must be greater than 0"),
  status:       z.enum(["scheduled", "active"]).default("scheduled"),
  jobType:      z.string().min(1, "Job type required"),
});

export async function POST(req: Request) {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const job = await db.job.create({ data: parsed.data });
  return NextResponse.json(job, { status: 201 });
}
```

- [ ] **Step 8: Run tests to confirm they pass**

```bash
npx vitest run src/app/api/jobs/__tests__/jobs.test.ts
```

Expected: All tests PASS (4 new POST + 4 existing DELETE).

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/app/api/jobs/route.ts src/app/api/jobs/__tests__/jobs.test.ts
git commit -m "feat: add jobType to Job model and require it on job creation"
```

---

### Task 2: `GET /api/quotes/job-types` route + NewJobForm update

**Files:**
- Create: `src/app/api/quotes/job-types/route.ts`
- Create: `src/app/api/quotes/__tests__/search.test.ts` (job-types tests — Task 3 expands this file)
- Modify: `src/app/jobs/NewJobForm.tsx`

**Interfaces:**
- Consumes: `Job.jobType String` from Task 1
- Produces: `GET /api/quotes/job-types` → `{ jobTypes: string[] }` — used by Task 4's QuotesClient and by NewJobForm

- [ ] **Step 1: Write failing tests for `GET /api/quotes/job-types`**

Create `src/app/api/quotes/__tests__/search.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { findMany: vi.fn(), groupBy: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET as GET_JOB_TYPES } from "../job-types/route";

const mockSalesEngineer = {
  id: "u1",
  role: "sales_engineer" as const,
  name: "Sam",
  clerkId: "c1",
  email: "s@e.com",
  isActive: true,
};

beforeEach(() => vi.clearAllMocks());

describe("GET /api/quotes/job-types", () => {
  it("returns 401 for technician role", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET_JOB_TYPES();
    expect(res.status).toBe(401);
  });

  it("returns 200 with sorted jobTypes for sales_engineer", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.groupBy).mockResolvedValue([
      { jobType: "Installation" },
      { jobType: "Service" },
    ] as any);
    const res = await GET_JOB_TYPES();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jobTypes).toEqual(["Installation", "Service"]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/quotes/__tests__/search.test.ts
```

Expected: Both tests FAIL (route file doesn't exist yet).

- [ ] **Step 3: Create `src/app/api/quotes/job-types/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET() {
  const user = await requireRole(["sales_engineer", "director", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.job.groupBy({
    by: ["jobType"],
    where: { status: "complete" },
    orderBy: { jobType: "asc" },
  });

  return NextResponse.json({ jobTypes: rows.map((r) => r.jobType) });
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/app/api/quotes/__tests__/search.test.ts
```

Expected: Both `job-types` tests PASS.

- [ ] **Step 5: Update `src/app/jobs/NewJobForm.tsx`**

Replace the entire file:

```tsx
"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

export function NewJobForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [jobTypeOptions, setJobTypeOptions] = useState<string[]>([]);

  const [fields, setFields] = useState({
    customerName: "",
    siteName: "",
    siteAddress: "",
    quotedHours: "",
    jobType: "",
    status: "scheduled" as "scheduled" | "active",
  });

  useEffect(() => {
    fetch("/api/quotes/job-types")
      .then((r) => (r.ok ? r.json() : { jobTypes: [] }))
      .then((d) => setJobTypeOptions(d.jobTypes ?? []));
  }, []);

  function set(key: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    const newErrors: Record<string, string> = {};
    if (fields.customerName.length < 2) newErrors.customerName = "Required";
    if (fields.siteName.length < 2) newErrors.siteName = "Required";
    if (fields.siteAddress.length < 5) newErrors.siteAddress = "Required";
    const hours = parseFloat(fields.quotedHours);
    if (!fields.quotedHours || isNaN(hours) || hours <= 0)
      newErrors.quotedHours = "Enter hours greater than 0";
    if (!fields.jobType.trim()) newErrors.jobType = "Required";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, quotedHours: hours }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErrors({ submit: data.error ?? "Failed to create job." });
        return;
      }
      router.refresh();
      onClose();
    });
  }

  const inputClass =
    "w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-base";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Customer name</label>
        <input
          type="text"
          value={fields.customerName}
          onChange={(e) => set("customerName", e.target.value)}
          placeholder="Acme Corp"
          className={inputClass}
        />
        {errors.customerName && <p className="text-sm text-red-600">{errors.customerName}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Site name</label>
        <input
          type="text"
          value={fields.siteName}
          onChange={(e) => set("siteName", e.target.value)}
          placeholder="North cooling tower"
          className={inputClass}
        />
        {errors.siteName && <p className="text-sm text-red-600">{errors.siteName}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Site address</label>
        <input
          type="text"
          value={fields.siteAddress}
          onChange={(e) => set("siteAddress", e.target.value)}
          placeholder="123 Main St, Sydney NSW 2000"
          className={inputClass}
        />
        {errors.siteAddress && <p className="text-sm text-red-600">{errors.siteAddress}</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Job type</label>
        <input
          type="text"
          list="new-job-type-options"
          value={fields.jobType}
          onChange={(e) => set("jobType", e.target.value)}
          placeholder="e.g. Installation"
          className={inputClass}
        />
        <datalist id="new-job-type-options">
          {jobTypeOptions.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {errors.jobType && <p className="text-sm text-red-600">{errors.jobType}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Quoted hours</label>
          <input
            type="number"
            inputMode="decimal"
            value={fields.quotedHours}
            onChange={(e) => set("quotedHours", e.target.value)}
            placeholder="8"
            className={inputClass}
          />
          {errors.quotedHours && <p className="text-sm text-red-600">{errors.quotedHours}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Status</label>
          <select
            value={fields.status}
            onChange={(e) => set("status", e.target.value as "scheduled" | "active")}
            className={inputClass}
          >
            <option value="scheduled">Scheduled</option>
            <option value="active">Active</option>
          </select>
        </div>
      </div>

      {errors.submit && <p className="text-sm text-red-600">{errors.submit}</p>}

      <div className="flex gap-3 pt-1">
        <button
          onClick={onClose}
          className="flex-1 min-h-[48px] rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="flex-1 min-h-[48px] rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm disabled:opacity-40"
        >
          {isPending ? "Creating…" : "Create job"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/quotes/job-types/route.ts src/app/api/quotes/__tests__/search.test.ts src/app/jobs/NewJobForm.tsx
git commit -m "feat: add GET /api/quotes/job-types and jobType field to NewJobForm"
```

---

### Task 3: `GET /api/quotes/search` route + full test suite

**Files:**
- Create: `src/app/api/quotes/search/route.ts`
- Modify: `src/app/api/quotes/__tests__/search.test.ts` (replace full file — adds search import at top + 12 search tests)

**Interfaces:**
- Consumes: `Job.jobType String` from Task 1; `GET /api/quotes/job-types` from Task 2 (test mock imports `GET` from search route, not job-types)
- Produces: `GET /api/quotes/search` → `{ jobs: QuoteRow[], stats: QuoteStats }` — consumed by Task 4's QuotesClient

- [ ] **Step 1: Replace `src/app/api/quotes/__tests__/search.test.ts` with the full file**

ESM imports are hoisted and must be at the top of the file. Replace the entire `src/app/api/quotes/__tests__/search.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { findMany: vi.fn(), groupBy: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET as GET_JOB_TYPES } from "../job-types/route";
import { GET as GET_SEARCH } from "../search/route";

const mockSalesEngineer = {
  id: "u1",
  role: "sales_engineer" as const,
  name: "Sam",
  clerkId: "c1",
  email: "s@e.com",
  isActive: true,
};

beforeEach(() => vi.clearAllMocks());

describe("GET /api/quotes/job-types", () => {
  it("returns 401 for technician role", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET_JOB_TYPES();
    expect(res.status).toBe(401);
  });

  it("returns 200 with sorted jobTypes for sales_engineer", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.groupBy).mockResolvedValue([
      { jobType: "Installation" },
      { jobType: "Service" },
    ] as any);
    const res = await GET_JOB_TYPES();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jobTypes).toEqual(["Installation", "Service"]);
  });
});
```

Then continue appending (same file) from the `baseJob` constant onwards:

const baseJob = {
  id: "j1",
  customerName: "Rio Tinto",
  siteName: "Weipa Plant",
  siteAddress: "1 Main Rd, Weipa QLD 4874",
  jobType: "Installation",
  quotedHours: 10,
  status: "complete",
  createdAt: new Date("2026-01-15T00:00:00.000Z"),
};

function makeSearchReq(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/quotes/search");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

describe("GET /api/quotes/search", () => {
  it("returns 401 for technician role", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET_SEARCH(makeSearchReq());
    expect(res.status).toBe(401);
  });

  it("returns 401 for draftsman role", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET_SEARCH(makeSearchReq());
    expect(res.status).toBe(401);
  });

  it("returns 401 for service_manager role", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));
    const res = await GET_SEARCH(makeSearchReq());
    expect(res.status).toBe(401);
  });

  it("returns 200 with jobs and stats for sales_engineer", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    const res = await GET_SEARCH(makeSearchReq());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("jobs");
    expect(data).toHaveProperty("stats");
  });

  it("computes actualHours as sum(durationMinutes)/60 rounded to 1dp", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([
      { ...baseJob, timeEntries: [{ durationMinutes: 720 }], variations: [] },
    ] as any);
    const res = await GET_SEARCH(makeSearchReq());
    const data = await res.json();
    expect(data.jobs[0].actualHours).toBe(12.0);
  });

  it("overagePct is null when quotedHours is 0", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([
      { ...baseJob, quotedHours: 0, timeEntries: [], variations: [] },
    ] as any);
    const res = await GET_SEARCH(makeSearchReq());
    const data = await res.json();
    expect(data.jobs[0].overagePct).toBeNull();
  });

  it("overagePct is 20.0 when quotedHours=10 and actualHours=12", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([
      { ...baseJob, quotedHours: 10, timeEntries: [{ durationMinutes: 720 }], variations: [] },
    ] as any);
    const res = await GET_SEARCH(makeSearchReq());
    const data = await res.json();
    expect(data.jobs[0].overagePct).toBe(20.0);
  });

  it("passes jobType filter to Prisma where clause", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    await GET_SEARCH(makeSearchReq({ jobType: "Installation" }));
    const whereArg = vi.mocked(db.job.findMany).mock.calls[0][0].where;
    expect(whereArg.jobType).toBe("Installation");
  });

  it("passes customerName filter with case-insensitive mode", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    await GET_SEARCH(makeSearchReq({ customerName: "rio tinto" }));
    const whereArg = vi.mocked(db.job.findMany).mock.calls[0][0].where;
    expect(whereArg.customerName).toEqual({ contains: "rio tinto", mode: "insensitive" });
  });

  it("response job rows contain no technician identifiers", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([
      { ...baseJob, timeEntries: [], variations: [] },
    ] as any);
    const res = await GET_SEARCH(makeSearchReq());
    const data = await res.json();
    for (const row of data.jobs) {
      expect(row).not.toHaveProperty("technicianId");
      expect(row).not.toHaveProperty("userId");
      expect(Object.keys(row)).not.toContain("name");
      expect(row).not.toHaveProperty("email");
    }
  });

  it("stats.count equals number of returned jobs", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([
      { ...baseJob, quotedHours: 10, timeEntries: [], variations: [] },
      { ...baseJob, id: "j2", quotedHours: 8, timeEntries: [], variations: [] },
    ] as any);
    const res = await GET_SEARCH(makeSearchReq());
    const data = await res.json();
    expect(data.stats.count).toBe(2);
    expect(data.jobs).toHaveLength(2);
  });

  it("stats.avgQuotedHours is the mean of returned jobs' quotedHours", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.job.findMany).mockResolvedValue([
      { ...baseJob, quotedHours: 10, timeEntries: [], variations: [] },
      { ...baseJob, id: "j2", quotedHours: 8, timeEntries: [], variations: [] },
    ] as any);
    const res = await GET_SEARCH(makeSearchReq());
    const data = await res.json();
    expect(data.stats.avgQuotedHours).toBe(9.0);
  });
});
```

- [ ] **Step 2: Run tests to confirm the file fails to load**

```bash
npx vitest run src/app/api/quotes/__tests__/search.test.ts
```

Expected: The entire file errors with "Cannot find module '../search/route'" — this is correct. The import cannot resolve until the route is created in Step 3.

- [ ] **Step 3: Create `src/app/api/quotes/search/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET(req: Request) {
  const user = await requireRole(["sales_engineer", "director", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobType     = searchParams.get("jobType")     ?? "";
  const customerName = searchParams.get("customerName") ?? "";
  const dateFrom    = searchParams.get("dateFrom")    ?? "";
  const dateTo      = searchParams.get("dateTo")      ?? "";

  const jobs = await db.job.findMany({
    where: {
      status: "complete",
      ...(jobType ? { jobType } : {}),
      ...(customerName
        ? { customerName: { contains: customerName, mode: "insensitive" } }
        : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo   ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    },
    include: {
      timeEntries: { where: { status: "complete" }, select: { durationMinutes: true } },
      variations:  { where: { status: "approved" }, select: { costEstimate: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const rows = jobs.map((job) => {
    const actualMinutes = job.timeEntries.reduce(
      (sum, e) => sum + (e.durationMinutes ?? 0),
      0
    );
    const actualHours = Math.round((actualMinutes / 60) * 10) / 10;
    const overagePct =
      job.quotedHours === 0
        ? null
        : Math.round(((actualHours - job.quotedHours) / job.quotedHours) * 1000) / 10;
    const variationTotal = job.variations.reduce(
      (sum, v) => sum + Number(v.costEstimate),
      0
    );
    return {
      id:             job.id,
      customerName:   job.customerName,
      siteName:       job.siteName,
      siteAddress:    job.siteAddress,
      jobType:        job.jobType,
      quotedHours:    job.quotedHours,
      actualHours,
      overagePct,
      variationCount: job.variations.length,
      variationTotal,
      createdAt:      job.createdAt.toISOString(),
    };
  });

  const nonNullOverages = rows.filter(
    (r): r is typeof rows[0] & { overagePct: number } => r.overagePct !== null
  );

  const count = rows.length;
  const stats = {
    count,
    avgQuotedHours:
      count === 0
        ? 0
        : Math.round((rows.reduce((s, r) => s + r.quotedHours, 0) / count) * 10) / 10,
    avgActualHours:
      count === 0
        ? 0
        : Math.round((rows.reduce((s, r) => s + r.actualHours, 0) / count) * 10) / 10,
    avgOveragePct:
      nonNullOverages.length === 0
        ? null
        : Math.round(
            (nonNullOverages.reduce((s, r) => s + r.overagePct, 0) / nonNullOverages.length) * 10
          ) / 10,
    avgVariationTotal:
      count === 0
        ? 0
        : Math.round((rows.reduce((s, r) => s + r.variationTotal, 0) / count) * 100) / 100,
  };

  return NextResponse.json({ jobs: rows, stats });
}
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run src/app/api/quotes/__tests__/search.test.ts
```

Expected: All 14 tests PASS (2 job-types + 12 search). The job-types tests re-run since they're now in the same file.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/quotes/search/route.ts src/app/api/quotes/__tests__/search.test.ts
git commit -m "feat: add GET /api/quotes/search with filtering and aggregate stats"
```

---

### Task 4: `/quotes` page + navigation

**Files:**
- Create: `src/app/quotes/page.tsx`
- Create: `src/app/quotes/QuotesClient.tsx`
- Modify: `src/lib/nav-config.ts`

**Interfaces:**
- Consumes: `GET /api/quotes/job-types` → `{ jobTypes: string[] }` (Task 2)
- Consumes: `GET /api/quotes/search` → `{ jobs: QuoteRow[], stats: QuoteStats }` (Task 3)

- [ ] **Step 1: Update `src/lib/nav-config.ts`**

Two changes:

**Change 1** — extend the `phase` union in the `NavItem` interface (find the `phase:` line and replace):
```typescript
phase: "1a" | "1b" | "1c" | "2" | "2b" | "3";
```

**Change 2** — add `BarChart2` to the lucide-react import (add it to the existing import line at the top):
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
  Settings,
  BarChart2,
  type LucideIcon,
} from "lucide-react";
```

**Change 3** — add the Quotes nav entry to the `navItems` array (add it after the Settings entry):
```typescript
{
  label: "Quotes",
  href: "/quotes",
  icon: BarChart2,
  description: "Historical job data for quoting",
  visibleTo: ["sales_engineer", "director", "admin"],
  phase: "2b",
},
```

- [ ] **Step 2: Create `src/app/quotes/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/clerk";
import { QuotesClient } from "./QuotesClient";

export default async function QuotesPage() {
  const user = await requireRole(["sales_engineer", "director", "admin"]).catch(() => null);
  if (!user) redirect("/");

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Quotes</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Historical job data for quoting
          </p>
        </div>
        <QuotesClient />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: Create `src/app/quotes/QuotesClient.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";

interface QuoteRow {
  id: string;
  customerName: string;
  siteName: string;
  siteAddress: string;
  jobType: string;
  quotedHours: number;
  actualHours: number;
  overagePct: number | null;
  variationCount: number;
  variationTotal: number;
  createdAt: string;
}

interface QuoteStats {
  count: number;
  avgQuotedHours: number;
  avgActualHours: number;
  avgOveragePct: number | null;
  avgVariationTotal: number;
}

export function QuotesClient() {
  const [jobType, setJobType] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [results, setResults] = useState<QuoteRow[]>([]);
  const [stats, setStats] = useState<QuoteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [jobTypes, setJobTypes] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/quotes/job-types")
      .then((r) => (r.ok ? r.json() : { jobTypes: [] }))
      .then((d) => setJobTypes(d.jobTypes ?? []));
    fetchResults({ jobType: "", customerName: "", dateFrom: "", dateTo: "" });
  }, []);

  async function fetchResults(filters: {
    jobType: string;
    customerName: string;
    dateFrom: string;
    dateTo: string;
  }) {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.jobType) params.set("jobType", filters.jobType);
    if (filters.customerName) params.set("customerName", filters.customerName);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    const res = await fetch(`/api/quotes/search?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setResults(data.jobs ?? []);
      setStats(data.stats ?? null);
    }
    setLoading(false);
  }

  function handleSearch() {
    fetchResults({ jobType, customerName, dateFrom, dateTo });
  }

  const inputClass =
    "min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 text-sm";

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[140px] space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Job type
          </label>
          <input
            type="text"
            list="quote-job-type-options"
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            placeholder="All types"
            className={`w-full ${inputClass}`}
          />
          <datalist id="quote-job-type-options">
            {jobTypes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>

        <div className="flex-1 min-w-[140px] space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Customer
          </label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="All customers"
            className={`w-full ${inputClass}`}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={inputClass}
          />
        </div>

        <button
          onClick={handleSearch}
          disabled={loading}
          className="min-h-[44px] px-5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm disabled:opacity-40"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {/* Stats card */}
      {stats && stats.count > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Avg quoted hrs", value: stats.avgQuotedHours.toFixed(1) },
            { label: "Avg actual hrs", value: stats.avgActualHours.toFixed(1) },
            {
              label: "Avg overage",
              value:
                stats.avgOveragePct != null
                  ? `${stats.avgOveragePct >= 0 ? "+" : ""}${stats.avgOveragePct.toFixed(1)}%`
                  : "—",
            },
            { label: "Avg variation total", value: `$${stats.avgVariationTotal.toFixed(2)}` },
            { label: "Jobs", value: String(stats.count) },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
            >
              <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && results.length === 0 && (
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          No completed jobs match your filters.
        </p>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {[
                  "Customer",
                  "Site",
                  "Type",
                  "Quoted hrs",
                  "Actual hrs",
                  "Overage",
                  "Variation total",
                ].map((h) => (
                  <th
                    key={h}
                    className="pb-2 pr-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((row) => {
                const overageClass =
                  row.overagePct === null
                    ? "text-slate-400"
                    : row.overagePct > 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-green-600 dark:text-green-400";
                const overageText =
                  row.overagePct === null
                    ? "—"
                    : `${row.overagePct >= 0 ? "+" : ""}${row.overagePct.toFixed(1)}%`;
                return (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2.5 pr-4">{row.customerName}</td>
                    <td className="py-2.5 pr-4">{row.siteName}</td>
                    <td className="py-2.5 pr-4">{row.jobType}</td>
                    <td className="py-2.5 pr-4">{row.quotedHours.toFixed(1)}</td>
                    <td className="py-2.5 pr-4">{row.actualHours.toFixed(1)}</td>
                    <td className={`py-2.5 pr-4 font-medium ${overageClass}`}>{overageText}</td>
                    <td
                      className={`py-2.5 pr-4 ${row.variationTotal === 0 ? "text-slate-400" : ""}`}
                    >
                      ${row.variationTotal.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type-check and run full test suite**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: No type errors. All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/quotes/page.tsx src/app/quotes/QuotesClient.tsx src/lib/nav-config.ts
git commit -m "feat: add /quotes page and Quotes nav entry for sales engineers"
```
