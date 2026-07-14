# Deterministic Data Layer & AI Assistant Efficiency Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this spec into a task-by-task implementation plan, then superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to build it.

**Goal:** Replace duplicated, independently-drifting Prisma queries for "which jobs/customers matter here" with a small set of shared, tested functions that every page, API route, and the AI assistant call into — so the same question always gets the same answer regardless of who's asking. Separately, cut AI assistant token spend by answering a handful of common, structured questions with plain deterministic code instead of a full Claude round-trip, and stop re-paying for static prompt content on every turn.

**Architecture:** Two independent-but-related pieces. (1) `src/lib/jobs/queries.ts` and `src/lib/customers/queries.ts` — plain exported functions (matching this codebase's existing `src/lib/<domain>/` convention, e.g. `variations/validate.ts`) encoding the business rules for "which jobs/customers qualify," consumed by every page/route currently duplicating that logic inline. (2) A row of quick-action buttons in the assistant chat UI that call the same query functions directly through a new lightweight endpoint — bypassing Claude entirely for those specific questions — plus `cache_control` on the assistant's static system prompt and tool schema so the LLM path that does run isn't re-billed for unchanged content every turn.

**Tech Stack:** Next.js 14 App Router (Server Components + Route Handlers), Prisma 7 + Neon, TypeScript, Vitest, `@anthropic-ai/sdk` prompt caching (`cache_control: { type: "ephemeral" }`).

## Global Constraints

- No new database tables, columns, or migrations — this is a code-organization and efficiency change, not a data model change.
- Every new query function gets a real Vitest unit test (matches this repo's established convention: routes/lib get tests, pages/interactive components don't).
- Existing role/permission checks in each call site are preserved exactly — the query functions only decide *which jobs/customers*, never *is this user allowed*. Auth stays where it already lives (`requireRole`/`getSessionUser` at the route/page level).
- No behavior change to any endpoint's response shape — this is a refactor of *how* the data is selected, not what's returned, except where explicitly called out below as a real bug fix.

---

## Part 1: Shared Query Layer

### Problem, with evidence

17 files call `db.job.findMany`/`findFirst` directly; there is no `src/lib/jobs/` or `src/lib/customers/` query module today. At least 6 of those independently write `status: { in: ["active", "scheduled"] } }` (or the same filter with the array order flipped), and they don't all mean the same thing by it:

- **`schedule/page.tsx:103`, `variations/submit/page.tsx:13`, `compliance/new/page.tsx:13`** are all job **pickers** — a human choosing a job to act on (assign a technician, log a variation, submit a compliance doc). For a technician, this should mean *jobs I'm assigned to*; for office roles, *all workable jobs*. Today none of them make that distinction — they all show every active/scheduled job to everyone. This is exactly the bug already fixed once this session (a technician's variation-submit dropdown showed jobs they weren't assigned to, which is also why the office-only `schedule/page.tsx` needs the "all jobs" branch to keep working unchanged).
- **`dashboard/HoursOverview.tsx:6-19`, `api/jobs/hours/route.ts:9-22`** are a genuine, exact duplicate of each other — same `where`, same `select` (including `quotedHours` and nested `timeEntries`), same `orderBy`, byte-for-byte — for a company-wide hours-vs-quoted report. Not a fit for the plain job-picker shape above (they need hours data the pickers don't), so this gets its own function.
- **`api/jobs/[id]/voice-notes/route.ts:19`, `src/lib/assistant/tools/draft.ts:29`** each independently do a single-record lookup: `db.job.findFirst({ where: { id, status: { in: [...] } } })`, then a separate assignment check. Same filter, single record instead of a list.

**Investigated and deliberately excluded: `time-tracking/page.tsx`.** Its job-list query (line 55) matches the `status: { in: [...] } }` string, which is why the initial code-audit flagged it as a 4th picker duplicate — but reading the full file shows it isn't. Lines 17-62 implement genuinely different, already-correct logic: today's assignments first (single- or multi-day spanning today), and only for technicians with zero assignments today, a fallback to their full historical active/scheduled assignments (directors/service managers get no fallback at all). Routing this through `getJobsAssignableToUser` would collapse that date-awareness and change real behavior (e.g. an office user clocking in would go from "only today's assigned jobs" to "every active/scheduled job company-wide"). Left untouched.

### New module: `src/lib/jobs/queries.ts`

```ts
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
 * (assigning a technician, logging a variation, submitting a compliance doc,
 * clocking in). Technicians see only jobs they're assigned to; every other
 * role sees the same company-wide list as getActiveJobs().
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

`getJobsAssignableToUser` relies on `Job.assignments` (`Assignment[]`, confirmed at `prisma/schema.prisma` — `model Job { ... assignments Assignment[] ... }`), filtering via `assignments: { some: { userId: user.id } }`.

### New module: `src/lib/customers/queries.ts`

```ts
import { db } from "@/lib/db/client";
import type { Customer } from "@prisma/client";

/** Single customer by id, or null if missing. */
export async function getCustomerById(id: string): Promise<Customer | null> {
  return db.customer.findUnique({ where: { id } });
}
```

Small on purpose — the only real duplication found on the customer side is the existence-check-before-use pattern, not a business-rule filter like the job side has.

### Migration list (every call site, old → new)

| File | Old | New |
|---|---|---|
| `src/app/schedule/page.tsx:102-106` | inline `db.job.findMany({ status: {in:[...]} })` | `getJobsAssignableToUser(user)` (office roles only reach this page, so this resolves to the same "all active/scheduled" list as before — no behavior change here) |
| `src/app/variations/submit/page.tsx:12-16` | inline query | `getJobsAssignableToUser(user)` — **behavior change**: technicians now see only their assigned jobs, closing the gap flagged during the earlier variation-submit bug fix |
| `src/app/compliance/new/page.tsx:12-16` | inline query (`["scheduled","active"]` order) | `getJobsAssignableToUser(user)` — same behavior change as above, for consistency |
| `src/app/dashboard/HoursOverview.tsx:6-19` | inline query, wrapped in `.catch(() => [])` | `getActiveJobsWithHours()`, keep the `.catch` wrapper at the call site — no behavior change |
| `src/app/api/jobs/hours/route.ts:9-22` | inline query, unwrapped (errors surface as a 500) | `getActiveJobsWithHours()`, no `.catch` — no behavior change |
| `src/app/api/jobs/[id]/voice-notes/route.ts:19` | `db.job.findFirst({ id, status:{in:[...]} })` | `getActiveJobById(id)` — no behavior change |
| `src/lib/assistant/tools/draft.ts:29` | same pattern | `getActiveJobById(id)` — no behavior change |
| `src/app/api/jobs/route.ts:29-31` | inline `db.customer.findUnique` + manual 404 | `getCustomerById(customerId)` — no behavior change |
| `src/app/api/quotes/route.ts:27-29` | inline `db.customer.findUnique` + manual 404 | `getCustomerById(customerId)` — no behavior change |
| `src/app/api/contracts/route.ts` (POST) | **no existence check at all** — a bad `customerId` currently fails as a raw Postgres FK error, not a clean 404 | add `getCustomerById(customerId)` + 404 — **real bug fix** |
| `src/app/api/assets/route.ts` (POST) | **no existence check at all**, same gap | add `getCustomerById(customerId)` + 404 — **real bug fix** |

**Explicitly out of scope, left as-is:**
- `src/app/jobs/page.tsx:17-22` — its query is a genuinely different, wider concern (active/scheduled OR completed-within-30-days, for the main jobs list view) and isn't duplicated anywhere else. Forcing it into `getActiveJobs()` would change its behavior for no benefit; it stays a page-local query.
- `src/app/time-tracking/page.tsx` — see above; different, already-correct, date-aware logic.
- `src/lib/assistant/tools/read.ts`'s `findJobs` tool — this is a deliberately flexible, filter-combinable search tool the AI uses for free-text-driven questions ("overdue jobs at Site X for customer Y"). It serves a different purpose than the fixed "give me the canonical picker list" functions above and isn't a good fit for migration; keeping it separate preserves that flexibility. (This was floated differently earlier in discussion, before its actual implementation was read — this is the corrected, code-grounded call.)

---

## Part 2: AI Assistant Efficiency

### Problem

Every assistant chat message — including fully predictable ones — triggers at least one full Claude API call (`src/app/api/assistant/chat/route.ts:133-134`), inside a loop that can run up to `MAX_ROUNDS = 5` sequential calls per single user message. The full conversation history is resent, un-cached, every turn. None of this is wrong, but for the subset of questions that are genuinely predictable in shape, it's paying LLM reasoning cost for something plain code can answer instantly and for free.

The assistant is office-role-only (`director`, `service_manager`, `admin`, `sales_engineer` — `route.ts:51`); technicians never see it. Quick actions are scoped to that audience — company-wide views, not "my jobs."

### Quick actions (deterministic, zero-token)

Add a row of buttons above the chat input in `ChatWidget.tsx`, each hitting a new lightweight route, `POST /api/assistant/quick-action` with body `{ action: "activeJobs" | "weekAssignments" }`, that calls a query function **directly** — no Claude call, no tokens, no `AiAuditLog` row (nothing was billed) — and renders the structured result as cards in the chat, exactly like a real assistant reply but instant:

| Button | Calls | Notes |
|---|---|---|
| "Active jobs" | `getActiveJobs()` (Part 1) | New shared function, already being built |
| "This week's assignments" | existing `findAssignments({ dateFrom, dateTo })` from `src/lib/assistant/tools/read.ts`, with the current week computed in code | Reuses the existing tool function as-is — only the *caller* changes (button, not LLM) |

Free-typed chat messages and the `semanticSearchTool` (inherently natural-language) are unchanged — they still go through the full Claude tool-calling loop, because that's the correct path for genuinely open-ended questions, not a gap to close.

`draftVariation`/`draftQuote` are not quick actions — they require gathering details across a conversation and already have a human-confirmation gate; a button can't shortcut that safely.

### Prompt caching

`route.ts`'s `systemPrompt` (built from `businessProfile.industryDescription`, effectively static per business) is sent fresh, as a plain string, on every one of up to 5 calls per turn — and `ASSISTANT_TOOLS` (fully static) precedes it in the request. Confirmed against the installed `@anthropic-ai/sdk` (`^0.110.0`) type definitions: `messages.create`'s `system` param accepts `string | Array<TextBlockParam>`, and `TextBlockParam` carries an optional `cache_control?: CacheControlEphemeral | null`. Anthropic's prefix caching covers everything up to and including a marked block, so a single breakpoint on the system block also covers the preceding static `tools` array — no need to separately mark `ASSISTANT_TOOLS`. Change `system: systemPrompt` to:
```ts
system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
```
This doesn't change behavior, only cost, and applies regardless of the quick-action work above.

---

## Testing

- `src/lib/jobs/__tests__/queries.test.ts` — one test per function: `getActiveJobs` excludes completed jobs; `getJobsAssignableToUser` returns only assigned jobs for a technician and all active/scheduled jobs for a director; `getActiveJobById` returns null for a completed job and for a missing id; `getActiveJobsWithHours` returns the hours-shaped rows.
- `src/lib/customers/__tests__/queries.test.ts` — `getCustomerById` returns the customer or null.
- Every migrated call site's existing test suite must still pass unchanged (these are refactors with identified behavior changes only where explicitly marked above) — the 2 marked "real bug fix" sites (`contracts/route.ts`, `assets/route.ts`) need a new test case each (POST now 404s on a bad `customerId` instead of throwing a raw FK error).
- New quick-action route gets a route test following this repo's existing route-test pattern (mock `db`, assert the response shape, assert no Claude client is invoked).
- Prompt caching: no new test needed beyond the existing chat route tests continuing to pass — this is a request-shape change, not a logic change.

---

## Rollout

Single PR, no feature flag needed (no existing flag mechanism in this app, and this doesn't warrant introducing one — see the separate multi-tenancy discussion for when that changes). Land Part 1 (query layer + migration) and Part 2 (quick actions + caching) as separate commits within the same branch so either can be reverted independently if something regresses.
