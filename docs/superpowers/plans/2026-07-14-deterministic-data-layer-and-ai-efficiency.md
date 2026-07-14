# Deterministic Data Layer & AI Assistant Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 12 duplicated Prisma queries for "which jobs/customers matter here" with 5 shared, tested functions in `src/lib/jobs/queries.ts` and `src/lib/customers/queries.ts`; fix a real gap where technicians could see jobs they weren't assigned to; add two deterministic (zero-LLM) quick-action buttons to the AI assistant; and enable prompt caching on the assistant's system prompt.

**Architecture:** Two plain function modules following this codebase's existing `src/lib/<domain>/` convention (e.g. `src/lib/variations/validate.ts`), consumed by every page/route that currently inlines the same Prisma query. A new lightweight route (`POST /api/assistant/quick-action`) calls those functions directly, bypassing the Claude tool-calling loop entirely for two predictable questions.

**Tech Stack:** Next.js 14 App Router (Server Components + Route Handlers), Prisma 7 + Neon, TypeScript, Vitest, `@anthropic-ai/sdk` `^0.110.0`.

## Global Constraints

- No new database tables, columns, or migrations.
- Every new query function gets a real Vitest unit test. Pages stay untested (existing convention); route changes get route tests.
- Existing role/permission checks in every call site are preserved exactly — the query functions only decide *which* jobs/customers, never *whether the user may see them*.
- No response-shape changes anywhere, except the two explicitly-marked behavior changes (Tasks 4, 5) and the two explicitly-marked bug fixes (Task 9).
- Land as separate commits per task so any single task can be reverted independently (per the spec's rollout note).

Full context: `docs/superpowers/specs/2026-07-14-deterministic-data-layer-and-ai-efficiency-design.md`.

---

### Task 1: `src/lib/jobs/queries.ts`

**Files:**
- Create: `src/lib/jobs/queries.ts`
- Test: `src/lib/jobs/__tests__/queries.test.ts`

**Interfaces:**
- Produces: `getActiveJobs(): Promise<{id, customerName, siteName, siteAddress, status}[]>`, `getJobsAssignableToUser(user: {id: string; role: string}): Promise<{id, customerName, siteName, siteAddress, status}[]>`, `getActiveJobById(id: string): Promise<Job | null>` (full Prisma `Job`), `getActiveJobsWithHours(): Promise<{id, customerName, siteName, quotedHours, timeEntries: {durationMinutes: number|null}[]}[]>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/jobs/__tests__/queries.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: { job: { findMany: vi.fn(), findFirst: vi.fn() } },
}));

import { db } from "@/lib/db/client";
import { getActiveJobs, getJobsAssignableToUser, getActiveJobById, getActiveJobsWithHours } from "../queries";

const JOB_LIST_SELECT = {
  id: true,
  customerName: true,
  siteName: true,
  siteAddress: true,
  status: true,
};

beforeEach(() => vi.clearAllMocks());

describe("getActiveJobs", () => {
  it("queries active/scheduled jobs with the picker select shape", async () => {
    vi.mocked(db.job.findMany).mockResolvedValue([{ id: "j1" }] as any);
    const result = await getActiveJobs();
    expect(db.job.findMany).toHaveBeenCalledWith({
      where: { status: { in: ["active", "scheduled"] } },
      select: JOB_LIST_SELECT,
      orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
    });
    expect(result).toEqual([{ id: "j1" }]);
  });
});

describe("getJobsAssignableToUser", () => {
  it("scopes to the technician's own assignments", async () => {
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    await getJobsAssignableToUser({ id: "u1", role: "technician" });
    expect(db.job.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["active", "scheduled"] },
        assignments: { some: { userId: "u1" } },
      },
      select: JOB_LIST_SELECT,
      orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
    });
  });

  it("returns all active/scheduled jobs for a non-technician role", async () => {
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    await getJobsAssignableToUser({ id: "u2", role: "director" });
    expect(db.job.findMany).toHaveBeenCalledWith({
      where: { status: { in: ["active", "scheduled"] } },
      select: JOB_LIST_SELECT,
      orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
    });
  });
});

describe("getActiveJobById", () => {
  it("queries by id scoped to active/scheduled status", async () => {
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "j1" } as any);
    const result = await getActiveJobById("j1");
    expect(db.job.findFirst).toHaveBeenCalledWith({
      where: { id: "j1", status: { in: ["active", "scheduled"] } },
    });
    expect(result).toEqual({ id: "j1" });
  });

  it("returns null when the job doesn't exist or isn't active", async () => {
    vi.mocked(db.job.findFirst).mockResolvedValue(null);
    const result = await getActiveJobById("missing");
    expect(result).toBeNull();
  });
});

describe("getActiveJobsWithHours", () => {
  it("queries active/scheduled jobs with hours and completed time entries", async () => {
    vi.mocked(db.job.findMany).mockResolvedValue([]);
    await getActiveJobsWithHours();
    expect(db.job.findMany).toHaveBeenCalledWith({
      where: { status: { in: ["active", "scheduled"] } },
      select: {
        id: true,
        customerName: true,
        siteName: true,
        quotedHours: true,
        timeEntries: {
          where: { status: "complete" },
          select: { durationMinutes: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/jobs/__tests__/queries.test.ts`
Expected: FAIL — `Cannot find module '../queries'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/jobs/queries.ts
import { db } from "@/lib/db/client";
import type { Job } from "@prisma/client";

interface CallingUser {
  id: string;
  role: string;
}

const JOB_LIST_SELECT = {
  id: true,
  customerName: true,
  siteName: true,
  siteAddress: true,
  status: true,
} as const;

/** Every currently-workable job, company-wide. No user-scoping — for aggregate/report views. */
export async function getActiveJobs() {
  return db.job.findMany({
    where: { status: { in: ["active", "scheduled"] } },
    select: JOB_LIST_SELECT,
    orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
  });
}

/**
 * Jobs this specific user may pick from when creating a record against a job
 * (assigning a technician, logging a variation, submitting a compliance doc).
 * Technicians see only jobs they're assigned to; every other role sees the
 * same company-wide list as getActiveJobs().
 */
export async function getJobsAssignableToUser(user: CallingUser) {
  if (user.role !== "technician") return getActiveJobs();

  return db.job.findMany({
    where: {
      status: { in: ["active", "scheduled"] },
      assignments: { some: { userId: user.id } },
    },
    select: JOB_LIST_SELECT,
    orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
  });
}

/** Single active/scheduled job by id, or null if missing/not currently workable. */
export async function getActiveJobById(id: string): Promise<Job | null> {
  return db.job.findFirst({ where: { id, status: { in: ["active", "scheduled"] } } });
}

/** Active/scheduled jobs with quoted vs. logged hours, for company-wide hours reporting. */
export async function getActiveJobsWithHours() {
  return db.job.findMany({
    where: { status: { in: ["active", "scheduled"] } },
    select: {
      id: true,
      customerName: true,
      siteName: true,
      quotedHours: true,
      timeEntries: {
        where: { status: "complete" },
        select: { durationMinutes: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/jobs/__tests__/queries.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/queries.ts src/lib/jobs/__tests__/queries.test.ts
git commit -m "feat: add shared job query functions (getActiveJobs, getJobsAssignableToUser, getActiveJobById, getActiveJobsWithHours)"
```

---

### Task 2: `src/lib/customers/queries.ts`

**Files:**
- Create: `src/lib/customers/queries.ts`
- Test: `src/lib/customers/__tests__/queries.test.ts`

**Interfaces:**
- Produces: `getCustomerById(id: string): Promise<Customer | null>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/customers/__tests__/queries.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: { customer: { findUnique: vi.fn() } },
}));

import { db } from "@/lib/db/client";
import { getCustomerById } from "../queries";

beforeEach(() => vi.clearAllMocks());

describe("getCustomerById", () => {
  it("returns the customer when found", async () => {
    vi.mocked(db.customer.findUnique).mockResolvedValue({ id: "c1", name: "Rio Tinto" } as any);
    const result = await getCustomerById("c1");
    expect(db.customer.findUnique).toHaveBeenCalledWith({ where: { id: "c1" } });
    expect(result).toEqual({ id: "c1", name: "Rio Tinto" });
  });

  it("returns null when not found", async () => {
    vi.mocked(db.customer.findUnique).mockResolvedValue(null);
    const result = await getCustomerById("missing");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/customers/__tests__/queries.test.ts`
Expected: FAIL — `Cannot find module '../queries'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/customers/queries.ts
import { db } from "@/lib/db/client";
import type { Customer } from "@prisma/client";

/** Single customer by id, or null if missing. */
export async function getCustomerById(id: string): Promise<Customer | null> {
  return db.customer.findUnique({ where: { id } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/customers/__tests__/queries.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/customers/queries.ts src/lib/customers/__tests__/queries.test.ts
git commit -m "feat: add getCustomerById shared query function"
```

---

### Task 3: Migrate `schedule/page.tsx` to `getJobsAssignableToUser`

**Files:**
- Modify: `src/app/schedule/page.tsx:102-106`

**Interfaces:**
- Consumes: `getJobsAssignableToUser(user: {id: string; role: string}): Promise<{id, customerName, siteName, siteAddress, status}[]>` from Task 1.

No behavior change: this branch of the page is only reachable by `service_manager`/`director`/`admin` (line 68's redirect gate), and `getJobsAssignableToUser` returns the same "all active/scheduled jobs" list as the old inline query for every role except `technician`.

- [ ] **Step 1: Add the import**

In `src/app/schedule/page.tsx`, add to the top import block:

```ts
import { getJobsAssignableToUser } from "@/lib/jobs/queries";
```

- [ ] **Step 2: Replace the inline query**

Change:

```ts
    db.job.findMany({
      where: { status: { in: ["active", "scheduled"] } },
      select: { id: true, customerName: true, siteName: true },
      orderBy: { customerName: "asc" },
    }),
```

to:

```ts
    getJobsAssignableToUser(user),
```

(This is the third element of the `Promise.all([...])` array at lines 80-107 — leave `db.assignment.findMany(...)` and `db.user.findMany(...)` untouched.)

- [ ] **Step 3: Run the existing test suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS (this page has no dedicated test file — pages aren't unit tested per this repo's convention — so this step confirms nothing else broke)

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (the returned job objects now include extra `siteAddress`/`status` fields beyond what `ScheduleGrid` previously received — this is additive and safe since `jobs` is passed as a variable, not an object literal, so TypeScript's excess-property check doesn't apply)

- [ ] **Step 5: Commit**

```bash
git add src/app/schedule/page.tsx
git commit -m "refactor: use getJobsAssignableToUser in schedule/page.tsx"
```

---

### Task 4: Migrate `variations/submit/page.tsx` to `getJobsAssignableToUser` (behavior change)

**Files:**
- Modify: `src/app/variations/submit/page.tsx:12-16`

**Interfaces:**
- Consumes: `getJobsAssignableToUser` from Task 1.

**Behavior change:** technicians now see only jobs they're assigned to in the variation-submit job picker, instead of every active/scheduled job company-wide.

- [ ] **Step 1: Add the import**

Add to the top import block of `src/app/variations/submit/page.tsx`:

```ts
import { getJobsAssignableToUser } from "@/lib/jobs/queries";
```

- [ ] **Step 2: Replace the inline query**

Change:

```ts
  const jobs = await db.job.findMany({
    where: { status: { in: ["active", "scheduled"] } },
    select: { id: true, customerName: true, siteName: true },
    orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
  });
```

to:

```ts
  const jobs = await getJobsAssignableToUser(user);
```

The `db` import at the top of the file becomes unused after this change — remove `import { db } from "@/lib/db/client";`.

- [ ] **Step 3: Run the existing test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/variations/submit/page.tsx
git commit -m "fix: scope the variation-submit job picker to the technician's own assignments"
```

---

### Task 5: Migrate `compliance/new/page.tsx` to `getJobsAssignableToUser` (behavior change)

**Files:**
- Modify: `src/app/compliance/new/page.tsx:11-22`

**Interfaces:**
- Consumes: `getJobsAssignableToUser` from Task 1.

**Behavior change:** same as Task 4, for the compliance-document job picker.

- [ ] **Step 1: Add the import**

Add to the top import block of `src/app/compliance/new/page.tsx`:

```ts
import { getJobsAssignableToUser } from "@/lib/jobs/queries";
```

- [ ] **Step 2: Replace the inline query**

Change:

```ts
  const [jobs, templates] = await Promise.all([
    db.job.findMany({
      where: { status: { in: ["scheduled", "active"] } },
      select: { id: true, customerName: true, siteName: true },
      orderBy: [{ customerName: "asc" }, { siteName: "asc" }],
    }),
    db.complianceTemplate.findMany({
      where: { isActive: true },
      select: { id: true, name: true, type: true, sections: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
```

to:

```ts
  const [jobs, templates] = await Promise.all([
    getJobsAssignableToUser(user),
    db.complianceTemplate.findMany({
      where: { isActive: true },
      select: { id: true, name: true, type: true, sections: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
```

- [ ] **Step 3: Run the existing test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/compliance/new/page.tsx
git commit -m "fix: scope the compliance-document job picker to the technician's own assignments"
```

---

### Task 6: Migrate `dashboard/HoursOverview.tsx` and `api/jobs/hours/route.ts` to `getActiveJobsWithHours`

**Files:**
- Modify: `src/app/dashboard/HoursOverview.tsx:1-19`
- Modify: `src/app/api/jobs/hours/route.ts:1-22`

**Interfaces:**
- Consumes: `getActiveJobsWithHours(): Promise<{id, customerName, siteName, quotedHours, timeEntries: {durationMinutes: number|null}[]}[]>` from Task 1.

No behavior change: both files send an identical Prisma query today; `getActiveJobsWithHours()` returns exactly the same shape.

- [ ] **Step 1: Update `HoursOverview.tsx`**

Change the top of `src/app/dashboard/HoursOverview.tsx` from:

```ts
import { db } from "@/lib/db/client";
import { isOverQuota } from "@/lib/time/utils";
import { cn } from "@/lib/utils/cn";

export async function HoursOverview() {
  const jobs = await db.job.findMany({
    where: { status: { in: ["active", "scheduled"] } },
    select: {
      id: true,
      customerName: true,
      siteName: true,
      quotedHours: true,
      timeEntries: {
        where: { status: "complete" },
        select: { durationMinutes: true },
      },
    },
    orderBy: { createdAt: "desc" },
  }).catch(() => []);
```

to:

```ts
import { getActiveJobsWithHours } from "@/lib/jobs/queries";
import { isOverQuota } from "@/lib/time/utils";
import { cn } from "@/lib/utils/cn";

export async function HoursOverview() {
  const jobs = await getActiveJobsWithHours().catch(() => []);
```

- [ ] **Step 2: Update `api/jobs/hours/route.ts`**

Change:

```ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";

export async function GET() {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobs = await db.job.findMany({
    where: { status: { in: ["active", "scheduled"] } },
    select: {
      id: true,
      customerName: true,
      siteName: true,
      quotedHours: true,
      timeEntries: {
        where: { status: "complete" },
        select: { durationMinutes: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
```

to:

```ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { getActiveJobsWithHours } from "@/lib/jobs/queries";

export async function GET() {
  const user = await requireRole(["director", "service_manager", "admin"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobs = await getActiveJobsWithHours();
```

- [ ] **Step 3: Run the existing test suite**

Run: `npx vitest run`
Expected: PASS — neither `src/app/dashboard/HoursOverview.tsx` nor `src/app/api/jobs/hours/route.ts` has a dedicated test file today (verified: no `__tests__` directory exists under `src/app/dashboard/` or `src/app/api/jobs/hours/`), so this step only needs to confirm the full suite still passes.

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/HoursOverview.tsx src/app/api/jobs/hours/route.ts
git commit -m "refactor: use getActiveJobsWithHours in HoursOverview and api/jobs/hours"
```

---

### Task 7: Migrate `api/jobs/[id]/voice-notes/route.ts` and `lib/assistant/tools/draft.ts` to `getActiveJobById`

**Files:**
- Modify: `src/app/api/jobs/[id]/voice-notes/route.ts:19`
- Modify: `src/lib/assistant/tools/draft.ts:29`

**Interfaces:**
- Consumes: `getActiveJobById(id: string): Promise<Job | null>` from Task 1.

No behavior change: both sites already do exactly this query (`db.job.findFirst({ where: { id, status: { in: ["active", "scheduled"] } } })`) inline.

- [ ] **Step 1: Update `voice-notes/route.ts`**

In `src/app/api/jobs/[id]/voice-notes/route.ts`, add the import:

```ts
import { getActiveJobById } from "@/lib/jobs/queries";
```

Change:

```ts
  const job = await db.job.findFirst({ where: { id: params.id, status: { in: ["active", "scheduled"] } } });
```

to:

```ts
  const job = await getActiveJobById(params.id);
```

The `db` import stays (the file still uses `db.assignment.findFirst` and `db.voiceNote.create` below it).

- [ ] **Step 2: Update `draft.ts`**

In `src/lib/assistant/tools/draft.ts`, add the import:

```ts
import { getActiveJobById } from "@/lib/jobs/queries";
```

Change (inside `draftVariation`):

```ts
  const job = await db.job.findFirst({ where: { id: args.jobId, status: { in: ["active", "scheduled"] } } });
```

to:

```ts
  const job = await getActiveJobById(args.jobId);
```

The `db` import stays (used elsewhere in the file for `db.user.findFirst`, `db.assignment.findFirst`, `db.variation.create`).

- [ ] **Step 3: Update `voice-notes/__tests__/route.test.ts`**

In `src/app/api/jobs/[id]/voice-notes/__tests__/route.test.ts`, change:

```ts
vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { findFirst: vi.fn() },
    assignment: { findFirst: vi.fn() },
    voiceNote: { create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/ai/assemblyai", () => ({
  uploadAudioToAssemblyAI: vi.fn(),
  submitTranscription: vi.fn(),
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { uploadAudioToAssemblyAI, submitTranscription } from "@/lib/ai/assemblyai";
import { POST } from "../route";
```

to:

```ts
vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    assignment: { findFirst: vi.fn() },
    voiceNote: { create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/jobs/queries", () => ({ getActiveJobById: vi.fn() }));
vi.mock("@/lib/ai/assemblyai", () => ({
  uploadAudioToAssemblyAI: vi.fn(),
  submitTranscription: vi.fn(),
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getActiveJobById } from "@/lib/jobs/queries";
import { uploadAudioToAssemblyAI, submitTranscription } from "@/lib/ai/assemblyai";
import { POST } from "../route";
```

Then replace every occurrence of `db.job.findFirst` with `getActiveJobById` (7 occurrences total in this file — one `mockResolvedValue(null)` in the "returns 404" test at line 55, and six `mockResolvedValue({ id: "job1" } as any)` calls at lines 62, 70, 84, 101, 128, 142). For example:

```ts
    vi.mocked(db.job.findFirst).mockResolvedValue(null);
```

becomes:

```ts
    vi.mocked(getActiveJobById).mockResolvedValue(null);
```

and every:

```ts
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job1" } as any);
```

becomes:

```ts
    vi.mocked(getActiveJobById).mockResolvedValue({ id: "job1" } as any);
```

- [ ] **Step 4: Update `tools/__tests__/draft.test.ts`**

In `src/lib/assistant/tools/__tests__/draft.test.ts`, change:

```ts
vi.mock("@/lib/db/client", () => ({
  db: {
    user: { findFirst: vi.fn() },
    job: { findFirst: vi.fn() },
    assignment: { findFirst: vi.fn() },
    variation: { create: vi.fn() },
    quote: { create: vi.fn() },
  },
}));

import { db } from "@/lib/db/client";
import { draftVariation, draftQuote } from "../draft";
```

to:

```ts
vi.mock("@/lib/db/client", () => ({
  db: {
    user: { findFirst: vi.fn() },
    assignment: { findFirst: vi.fn() },
    variation: { create: vi.fn() },
    quote: { create: vi.fn() },
  },
}));
vi.mock("@/lib/jobs/queries", () => ({ getActiveJobById: vi.fn() }));

import { db } from "@/lib/db/client";
import { getActiveJobById } from "@/lib/jobs/queries";
import { draftVariation, draftQuote } from "../draft";
```

Then replace both occurrences (lines 43 and 62) of:

```ts
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job1" } as any);
```

with:

```ts
    vi.mocked(getActiveJobById).mockResolvedValue({ id: "job1" } as any);
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/app/api/jobs/\[id\]/voice-notes/__tests__/route.test.ts src/lib/assistant/tools/__tests__/draft.test.ts`
Expected: PASS (all tests, unchanged count)

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/app/api/jobs/\[id\]/voice-notes/route.ts src/lib/assistant/tools/draft.ts
git commit -m "refactor: use getActiveJobById in voice-notes route and assistant draftVariation tool"
```

---

### Task 8: Migrate `api/jobs/route.ts` and `api/quotes/route.ts` to `getCustomerById`

**Files:**
- Modify: `src/app/api/jobs/route.ts:1-41`
- Modify: `src/app/api/quotes/route.ts:1-52`
- Modify: `src/app/api/jobs/__tests__/jobs.test.ts`
- Modify: `src/app/api/quotes/__tests__/quotes.test.ts`

**Interfaces:**
- Consumes: `getCustomerById(id: string): Promise<Customer | null>` from Task 2.

No behavior change: both routes already do exactly `db.customer.findUnique({ where: { id: customerId } })` + a 404 on null.

- [ ] **Step 1: Update `api/jobs/route.ts`**

Change:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
```

to:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getCustomerById } from "@/lib/customers/queries";
```

Change:

```ts
  if (customerId) {
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    customerName = customer.name;
```

to:

```ts
  if (customerId) {
    const customer = await getCustomerById(customerId);
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    customerName = customer.name;
```

(`db` stays imported — still used for `db.job.create`.)

- [ ] **Step 2: Update `jobs.test.ts`**

In `src/app/api/jobs/__tests__/jobs.test.ts`, change:

```ts
vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job:      { update: vi.fn(), delete: vi.fn(), create: vi.fn() },
    customer: { findUnique: vi.fn() },
  },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
```

to:

```ts
vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    job: { update: vi.fn(), delete: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/customers/queries", () => ({ getCustomerById: vi.fn() }));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getCustomerById } from "@/lib/customers/queries";
```

Then change the two tests that reference `db.customer.findUnique`:

```ts
  it("returns 404 when customerId references unknown customer", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue(null);
```

to:

```ts
  it("returns 404 when customerId references unknown customer", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(getCustomerById).mockResolvedValue(null);
```

and:

```ts
  it("derives customerName from customer when customerId is provided", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "BHP",
    } as any);
```

to:

```ts
  it("derives customerName from customer when customerId is provided", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(getCustomerById).mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "BHP",
    } as any);
```

- [ ] **Step 3: Update `api/quotes/route.ts`**

Change:

```ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateCreateQuoteInput, calculateQuoteTotal } from "@/lib/quoting/validate";
```

to:

```ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateCreateQuoteInput, calculateQuoteTotal } from "@/lib/quoting/validate";
import { getCustomerById } from "@/lib/customers/queries";
```

Change:

```ts
  if (customerId) {
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    customerName = customer.name;
```

to:

```ts
  if (customerId) {
    const customer = await getCustomerById(customerId);
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    customerName = customer.name;
```

(`db` stays imported — still used for `db.quote.findMany`/`db.quote.create`.)

- [ ] **Step 4: Update `quotes.test.ts`**

In `src/app/api/quotes/__tests__/quotes.test.ts`, change:

```ts
vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { quote: { findMany: vi.fn(), create: vi.fn() }, customer: { findUnique: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
```

to:

```ts
vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { quote: { findMany: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/customers/queries", () => ({ getCustomerById: vi.fn() }));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getCustomerById } from "@/lib/customers/queries";
```

Then change the two tests referencing `db.customer.findUnique`:

```ts
  it("returns 404 when customerId doesn't match a real customer", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue(null);
```

to:

```ts
  it("returns 404 when customerId doesn't match a real customer", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(getCustomerById).mockResolvedValue(null);
```

and:

```ts
  it("resolves customerId to a real customer and snapshots its name, when no customerName is given", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(db.customer.findUnique).mockResolvedValue({ id: "c1", name: "Rio Tinto Pty Ltd" } as any);
```

to:

```ts
  it("resolves customerId to a real customer and snapshots its name, when no customerName is given", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockSalesEngineer as any);
    vi.mocked(getCustomerById).mockResolvedValue({ id: "c1", name: "Rio Tinto Pty Ltd" } as any);
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/app/api/jobs/__tests__/jobs.test.ts src/app/api/quotes/__tests__/quotes.test.ts`
Expected: PASS (all tests, unchanged count)

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/app/api/jobs/route.ts src/app/api/jobs/__tests__/jobs.test.ts src/app/api/quotes/route.ts src/app/api/quotes/__tests__/quotes.test.ts
git commit -m "refactor: use getCustomerById in jobs and quotes creation routes"
```

---

### Task 9: Add customer-existence check to `api/contracts/route.ts` and `api/assets/route.ts` (bug fix)

**Files:**
- Modify: `src/app/api/contracts/route.ts:15-42`
- Modify: `src/app/api/assets/route.ts:22-31`
- Modify: `src/app/api/contracts/__tests__/contracts.test.ts`
- Modify: `src/app/api/assets/__tests__/assets.test.ts`

**Interfaces:**
- Consumes: `getCustomerById` from Task 2.

**Bug fix:** both POST handlers currently create a record with a client-supplied `customerId` with **no existence check** — a bad id fails later as a raw Postgres FK error (unhandled, surfaces as a 500), not a clean 404.

- [ ] **Step 1: Write the failing tests**

In `src/app/api/contracts/__tests__/contracts.test.ts`, change the mock block:

```ts
vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { contract: { findMany: vi.fn(), create: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET, POST } from "../route";
```

to:

```ts
vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { contract: { findMany: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/customers/queries", () => ({ getCustomerById: vi.fn() }));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getCustomerById } from "@/lib/customers/queries";
import { GET, POST } from "../route";
```

Then update the existing "returns 201" test to mock a found customer (otherwise it will now fail, since `getCustomerById` defaults to resolving `undefined`):

```ts
  it("returns 201 and computes renewalDate from startDate + cadence", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(db.contract.create).mockResolvedValue({
```

to:

```ts
  it("returns 201 and computes renewalDate from startDate + cadence", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(getCustomerById).mockResolvedValue({ id: CUSTOMER_ID, name: "Rio Tinto" } as any);
    vi.mocked(db.contract.create).mockResolvedValue({
```

Then add a new test at the end of the `describe("POST /api/contracts", ...)` block:

```ts

  it("returns 404 when customerId doesn't match a real customer", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(getCustomerById).mockResolvedValue(null);
    const res = await POST(makePostReq(body));
    expect(res.status).toBe(404);
    expect(db.contract.create).not.toHaveBeenCalled();
  });
```

In `src/app/api/assets/__tests__/assets.test.ts`, change the mock block:

```ts
vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { asset: { findMany: vi.fn(), create: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { GET, POST } from "../route";
```

to:

```ts
vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { asset: { findMany: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/customers/queries", () => ({ getCustomerById: vi.fn() }));

import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { getCustomerById } from "@/lib/customers/queries";
import { GET, POST } from "../route";
```

Then update the existing "returns 201" test:

```ts
  it("returns 201 and creates the asset for admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockAdmin as any);
    vi.mocked(db.asset.create).mockResolvedValue({ id: "a1", ...body } as any);
```

to:

```ts
  it("returns 201 and creates the asset for admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockAdmin as any);
    vi.mocked(getCustomerById).mockResolvedValue({ id: CUSTOMER_ID, name: "Rio Tinto" } as any);
    vi.mocked(db.asset.create).mockResolvedValue({ id: "a1", ...body } as any);
```

Then add a new test at the end of the `describe("POST /api/assets", ...)` block:

```ts

  it("returns 404 when customerId doesn't match a real customer", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockAdmin as any);
    vi.mocked(getCustomerById).mockResolvedValue(null);
    const res = await POST(makePostReq(body));
    expect(res.status).toBe(404);
    expect(db.asset.create).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/app/api/contracts/__tests__/contracts.test.ts src/app/api/assets/__tests__/assets.test.ts`
Expected: the two new "returns 404" tests FAIL (routes don't check yet — they'll currently attempt `db.contract.create`/`db.asset.create`, which is mocked to resolve successfully regardless, so the response will be 201, not 404)

- [ ] **Step 3: Add the check to `api/contracts/route.ts`**

Change:

```ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateCreateContractInput, calculateRenewalDate } from "@/lib/contracts/validate";
```

to:

```ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateCreateContractInput, calculateRenewalDate } from "@/lib/contracts/validate";
import { getCustomerById } from "@/lib/customers/queries";
```

Change:

```ts
  const body = await req.json();
  const parsed = validateCreateContractInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const startDate = new Date(parsed.data.startDate);
```

to:

```ts
  const body = await req.json();
  const parsed = validateCreateContractInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const customer = await getCustomerById(parsed.data.customerId);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const startDate = new Date(parsed.data.startDate);
```

- [ ] **Step 4: Add the check to `api/assets/route.ts`**

Change:

```ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateCreateAssetInput } from "@/lib/assets/validate";
```

to:

```ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { db } from "@/lib/db/client";
import { validateCreateAssetInput } from "@/lib/assets/validate";
import { getCustomerById } from "@/lib/customers/queries";
```

Change:

```ts
  const body = await req.json();
  const parsed = validateCreateAssetInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const asset = await db.asset.create({ data: parsed.data });
```

to:

```ts
  const body = await req.json();
  const parsed = validateCreateAssetInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const customer = await getCustomerById(parsed.data.customerId);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const asset = await db.asset.create({ data: parsed.data });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/api/contracts/__tests__/contracts.test.ts src/app/api/assets/__tests__/assets.test.ts`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no errors

- [ ] **Step 7: Commit**

```bash
git add src/app/api/contracts/route.ts src/app/api/contracts/__tests__/contracts.test.ts src/app/api/assets/route.ts src/app/api/assets/__tests__/assets.test.ts
git commit -m "fix: 404 (not raw FK error) when contracts/assets POST references an unknown customerId"
```

---

### Task 10: Quick-action route

**Files:**
- Create: `src/app/api/assistant/quick-action/route.ts`
- Test: `src/app/api/assistant/quick-action/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getActiveJobs()` from Task 1; `findAssignments(args: {technicianName?, siteId?, dateFrom?, dateTo?}): Promise<{technicianName, customerName, siteName, assignedDate}[]>` (existing, `src/lib/assistant/tools/read.ts`); `weekStart(date: Date): Date` (existing, `src/lib/schedule/dateUtils.ts`).
- Produces: `POST /api/assistant/quick-action` accepting `{ action: "activeJobs" | "weekAssignments" }`, returning `{ reply: string }` on success (same shape ChatWidget already consumes from `/api/assistant/chat`) or `{ error: string }` with a 401/400 status.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/assistant/quick-action/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/clerk", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/jobs/queries", () => ({ getActiveJobs: vi.fn() }));
vi.mock("@/lib/assistant/tools/read", () => ({ findAssignments: vi.fn() }));

import { requireRole } from "@/lib/auth/clerk";
import { getActiveJobs } from "@/lib/jobs/queries";
import { findAssignments } from "@/lib/assistant/tools/read";
import { POST } from "../route";

const mockDirector = { id: "u1", role: "director" as const, name: "Dana", clerkId: "c1", email: "d@t.com", isActive: true };

function makeReq(body: unknown) {
  return new Request("http://localhost/api/assistant/quick-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/assistant/quick-action", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeReq({ action: "activeJobs" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an unknown action", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    const res = await POST(makeReq({ action: "bogus" }));
    expect(res.status).toBe(400);
  });

  it("formats the active jobs list without calling Claude", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(getActiveJobs).mockResolvedValue([
      { id: "j1", customerName: "Glencore", siteName: "Mt Isa", siteAddress: "22 Marian St", status: "active" },
    ] as any);
    const res = await POST(makeReq({ action: "activeJobs" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reply).toContain("Glencore");
    expect(data.reply).toContain("Mt Isa");
  });

  it("returns a fallback message when there are no active jobs", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(getActiveJobs).mockResolvedValue([]);
    const res = await POST(makeReq({ action: "activeJobs" }));
    const data = await res.json();
    expect(data.reply).toBe("No active or scheduled jobs.");
  });

  it("formats this week's assignments using a computed date range", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(findAssignments).mockResolvedValue([
      { technicianName: "Jake Morrison", customerName: "Glencore", siteName: "Mt Isa", assignedDate: "2026-07-14T00:00:00.000Z" },
    ] as any);
    const res = await POST(makeReq({ action: "weekAssignments" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reply).toContain("Jake Morrison");
    expect(findAssignments).toHaveBeenCalledWith(
      expect.objectContaining({ dateFrom: expect.any(String), dateTo: expect.any(String) })
    );
  });

  it("returns a fallback message when there are no assignments this week", async () => {
    vi.mocked(requireRole).mockResolvedValue(mockDirector as any);
    vi.mocked(findAssignments).mockResolvedValue([]);
    const res = await POST(makeReq({ action: "weekAssignments" }));
    const data = await res.json();
    expect(data.reply).toBe("No assignments this week.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/assistant/quick-action/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'`

- [ ] **Step 3: Write the implementation**

```ts
// src/app/api/assistant/quick-action/route.ts
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/clerk";
import { getActiveJobs } from "@/lib/jobs/queries";
import { findAssignments } from "@/lib/assistant/tools/read";
import { weekStart } from "@/lib/schedule/dateUtils";

const QUICK_ACTION_ROLES = ["director", "service_manager", "admin", "sales_engineer"];

function formatActiveJobs(jobs: Awaited<ReturnType<typeof getActiveJobs>>): string {
  if (jobs.length === 0) return "No active or scheduled jobs.";
  const lines = jobs.map((j) => `- **${j.customerName}** — ${j.siteName} (${j.status})`);
  return ["**Active & scheduled jobs:**", "", ...lines].join("\n");
}

function formatWeekAssignments(assignments: Awaited<ReturnType<typeof findAssignments>>): string {
  if (assignments.length === 0) return "No assignments this week.";
  const lines = assignments.map(
    (a) => `- **${a.technicianName}** — ${a.customerName} (${a.siteName}), ${new Date(a.assignedDate).toLocaleDateString("en-AU")}`
  );
  return ["**This week's assignments:**", "", ...lines].join("\n");
}

export async function POST(req: Request) {
  const user = await requireRole(QUICK_ACTION_ROLES).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const action = body?.action;

  if (action === "activeJobs") {
    const jobs = await getActiveJobs();
    return NextResponse.json({ reply: formatActiveJobs(jobs) });
  }

  if (action === "weekAssignments") {
    const monday = weekStart(new Date());
    const weekEnd = new Date(monday);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const assignments = await findAssignments({
      dateFrom: monday.toISOString(),
      dateTo: weekEnd.toISOString(),
    });
    return NextResponse.json({ reply: formatWeekAssignments(assignments) });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/assistant/quick-action/__tests__/route.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/api/assistant/quick-action/route.ts src/app/api/assistant/quick-action/__tests__/route.test.ts
git commit -m "feat: add deterministic quick-action route (active jobs, week assignments) with zero LLM calls"
```

---

### Task 11: Quick-action buttons in `ChatWidget.tsx`

**Files:**
- Modify: `src/components/assistant/ChatWidget.tsx`

**Interfaces:**
- Consumes: `POST /api/assistant/quick-action` from Task 10, response `{ reply: string }`.

- [ ] **Step 1: Add the `sendQuickAction` function**

In `src/components/assistant/ChatWidget.tsx`, add this function directly after `confirmPendingAction` (after the closing `}` at what is currently line 111):

```ts
  async function sendQuickAction(action: "activeJobs" | "weekAssignments") {
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/assistant/quick-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setError("Failed to load. Try again.");
    } finally {
      setSending(false);
    }
  }
```

- [ ] **Step 2: Add the button row to the panel JSX**

Change:

```tsx
      <div className="flex gap-2 p-3 border-t border-slate-200 dark:border-slate-700">
        <input
          value={input}
```

to:

```tsx
      <div className="flex gap-2 px-3 pt-2">
        <button
          type="button"
          onClick={() => sendQuickAction("activeJobs")}
          disabled={sending || !!pendingAction}
          className="flex-1 min-h-[32px] rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-medium disabled:opacity-40"
        >
          Active jobs
        </button>
        <button
          type="button"
          onClick={() => sendQuickAction("weekAssignments")}
          disabled={sending || !!pendingAction}
          className="flex-1 min-h-[32px] rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-medium disabled:opacity-40"
        >
          This week&apos;s assignments
        </button>
      </div>
      <div className="flex gap-2 p-3 border-t border-slate-200 dark:border-slate-700">
        <input
          value={input}
```

(This inserts a new button row directly above the existing input row, inside the same `panel` JSX. Both blocks stay inside the parent `<div className={inline ? "..." : "..."}>` that wraps the whole panel.)

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, sign in as a `director`/`service_manager`/`admin`/`sales_engineer` account, open the assistant chat widget, click "Active jobs" and confirm a formatted job list appears instantly (network tab shows a call to `/api/assistant/quick-action`, not `/api/assistant/chat`); click "This week's assignments" and confirm the same.

- [ ] **Step 5: Commit**

```bash
git add src/components/assistant/ChatWidget.tsx
git commit -m "feat: add quick-action buttons to the assistant chat widget"
```

---

### Task 12: Prompt caching on the assistant's system prompt

**Files:**
- Modify: `src/app/api/assistant/chat/route.ts:133-139`
- Modify: `src/app/api/assistant/chat/__tests__/route.test.ts`

**Interfaces:**
- No new exports — internal request-shape change only.

- [ ] **Step 1: Update the existing system-prompt assertions to match the new array shape**

In `src/app/api/assistant/chat/__tests__/route.test.ts`, change:

```ts
    const [callArg] = mockCreate.mock.calls[0];
    expect(callArg.system).toContain("HVAC servicing");
    expect(callArg.system).not.toContain("cooling tower");
  });
```

to:

```ts
    const [callArg] = mockCreate.mock.calls[0];
    expect(callArg.system[0].text).toContain("HVAC servicing");
    expect(callArg.system[0].text).not.toContain("cooling tower");
    expect(callArg.system[0].cache_control).toEqual({ type: "ephemeral" });
  });
```

and change:

```ts
    const [callArg] = mockCreate.mock.calls[0];
    expect(callArg.system).toContain("field service maintenance");
  });
```

to:

```ts
    const [callArg] = mockCreate.mock.calls[0];
    expect(callArg.system[0].text).toContain("field service maintenance");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/assistant/chat/__tests__/route.test.ts`
Expected: FAIL — `callArg.system[0]` is `undefined` (system is still a plain string)

- [ ] **Step 3: Update the route**

In `src/app/api/assistant/chat/route.ts`, change:

```ts
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        tools: ASSISTANT_TOOLS,
        messages,
      });
```

to:

```ts
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        tools: ASSISTANT_TOOLS,
        messages,
      });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/assistant/chat/__tests__/route.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/api/assistant/chat/route.ts src/app/api/assistant/chat/__tests__/route.test.ts
git commit -m "perf: cache the assistant's static system prompt (and preceding tool schema) via Anthropic prompt caching"
```

---

## Final Verification

- [ ] Run `npx vitest run` — full suite passes.
- [ ] Run `npx tsc --noEmit` — no errors.
- [ ] Manually verify: as a technician, `/variations/submit` and `/compliance/new` job pickers show only assigned jobs (Task 4/5's behavior change).
- [ ] Manually verify: `POST /api/contracts` and `POST /api/assets` with a nonexistent `customerId` return 404, not a 500 (Task 9's bug fix).
- [ ] Manually verify: the assistant chat widget's quick-action buttons render instantly with no "Thinking…" delay (Task 10/11).
