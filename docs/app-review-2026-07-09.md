# Cooling Tower App — Multi-Perspective Expert Review

**Date:** 2026-07-09
**Scope:** Full codebase as of `main` (post AI Company Assistant merge, commit `ecc1c96`)
**Method:** Four independent, read-only expert review passes — Solution Architecture, Security, UX (mobile & desktop), Database — each conducted by a separate review agent with no visibility into the others' findings.

---

## Solution Architect Review

### 1. Overall architecture — coherent shell, missing service layer

The top-level layering (`src/app` routes, `src/lib` shared logic, `src/components`) is conventional and mostly legible, and the `lib/<domain>/` folders with co-located `__tests__` show real discipline. But there is **no service/domain layer**. `src/lib` is a grab-bag of *utilities* (validation schemas, PDF renderers, AI clients, auth helpers) — it holds almost no business logic. All orchestration lives directly in route handlers:

- `src/app/api/variations/route.ts:28-88` — a single POST does input validation, job-status lookup, assignment authorization, the `variation.create`, a fan-out query for directors, and push-notification dispatch. None of this is reusable; the AI assistant re-implements the same variation-creation rules independently in `src/lib/assistant/tools/draft.ts:14-50`, and the two have already diverged (the route sends push notifications and returns a serialized cost; the tool does neither).
- `src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/route.ts:41-78` — summarize → transaction-write → photo persist → semantic index, all inline.

On the client side, several components are effectively page-controllers doing fetch + state + rendering: `ScheduleGrid.tsx` (535 lines), `JobsClient.tsx` (478), `CustomerDetail.tsx` (437). These are the client-side analogue of the fat route handlers — they will keep accreting.

Net: layering is *coherent but shallow*. Any logic used by more than one caller has no home, so it gets copy-pasted (see variation creation above, and audit logging in §6).

### 2. Consistency across features — three competing idioms for each cross-cutting concern

The phase-by-phase growth has left **parallel conventions for the same problem**:

**Input validation** — two patterns coexist. Newer/complex features extract a `validate.ts` module (`src/lib/{variations,voice-notes,contracts,materials,assets,quoting,communications,assistant}/validate.ts`), while `jobs`, `customers`, and `settings` inline the Zod schema in the route (`api/jobs/route.ts:6-15`, `api/customers/route.ts:6-14`, `api/settings/route.ts:17-25`). No rule governs which to use.

**Auth idiom** — the dominant form is `requireRole([...]).catch(() => null)` → 401 (used ~40×). But `api/settings/route.ts:27-32` uses `try { await requireRole(...) } catch { 403 }`, and six routes use `getSessionUser()` + manual role checks (`api/settings`, `api/schedule/assignments`, `api/compliance/templates/*`, `api/photos`). Consequently **the same failure returns different status codes** — the dominant idiom collapses *unauthenticated* and *forbidden* both to 401, while settings correctly distinguishes 403.

**Error-body shape** — `{ error: message }` (most routes), `{ error: "Invalid input", issues: [...] }` (`api/variations/route.ts:35`), and validation failures return 400 almost everywhere but **422** in `api/settings/route.ts:41`. A client can't rely on one error contract.

**Decimal serialization** is hand-rolled per route (`.toNumber()` in `api/variations/route.ts:23,85`; the same dance recurs in invoices/quotes) with no shared serializer, so it's easy to forget and ship a `Decimal` object to the client.

### 3. Scalability & maintainability — authorization is the structural risk

**RBAC is defined by scattered literals, twice.** `requireRole` is called with ~20 distinct hardcoded role arrays; the 6-role compliance array `["technician","director","service_manager","admin","sales_engineer","draftsman"]` is duplicated verbatim across four files (`api/compliance/documents/route.ts:15,31`, `.../documents/[id]/route.ts:6`, `.../documents/[id]/pdf/route.ts:7`). Separately, **the same authorization is expressed a second time** as `visibleTo` arrays in `src/lib/nav-config.ts:36-141`. There is no single permission matrix, so nav visibility and API enforcement can silently drift, and adding a role means auditing dozens of inline arrays. `OFFICE_ROLES` in `api/jobs/[id]/communications/route.ts:7` is the one attempt to name a role-set — but it's a local `const` in a single file, not a shared abstraction, so it demonstrates the need without meeting it.

**Semantic search is structurally coupled to Jobs.** `DocumentChunk.jobId` is non-nullable (`schema.prisma:418-431`) and `indexDocument(sourceType, sourceId, jobId, text)` requires a job (`lib/ai/semanticSearch.ts:7-26`). Indexing anything not tied to a job — a customer-level note, a contract, a compliance template — is impossible without schema change. For a feature meant to grow into general "company knowledge," this is a limiting assumption baked into the data model.

**God components** (§1) will be the day-to-day maintainability tax.

### 4. Technical debt — concrete items

- **Dead `draftsman` role.** The Draftsman Module was scrapped, but the role remains threaded through 15 sites (`schema.prisma:15`, `nav-config.ts:23,98`, team UI, clerk webhook allow-list, four compliance routes). It's live surface area for a feature that doesn't exist — described as "Read-only access" in `dev/page.tsx:34` but never actually enforced as read-only.
- **`/api/ai/validate` contradicts its own spec.** The plan (`docs/superpowers/plans/2026-07-08-ai-validation-coworker.md`) specifies a Haiku fallback that runs when rules find nothing, and states *"Every AI call is logged to AiAuditLog … this table and its cost-calculation helper are shared by batches h and i too."* The shipped route (`api/ai/validate/route.ts:6-40`) does **only** the two deterministic rule layers — no `getAnthropicClient`, no `calculateCostUsd`, no `aiAuditLog` write. As a result the `AiFeature.validation` enum value (`schema.prisma:76`) is **dead — never written anywhere** in the codebase. Either the LLM tier was cut and the enum/plan not reconciled, or it's genuinely half-finished.
- **`as any` casts** to satisfy the PDF renderer's `User` shape: `api/compliance/documents/route.ts:53`, plus four in `api/compliance/templates/[id]/preview/route.ts`. A signal the compliance PDF input type is wrong.
- **Auth JIT race hack**: `lib/auth/clerk.ts:25-29` retries `currentUser()` after a hardcoded `setTimeout(400)` to paper over Clerk propagation. Functional, but a latency/reliability smell on the hot path of every request.

### 5. Trade-agnostic goal — the data model honors it; the AI prompts don't

Structurally, the **schema is genuinely generic**: `Job.jobType`/`siteName`/`siteAddress` are free strings, `Asset.assetType`/`serialNumber` are generic (`schema.prisma:136-165, 314-328`), compliance templates are JSON-driven. Nothing in the relational model assumes cooling towers. This is the strongest part of the "trade-agnostic" story.

The leak is in the **AI layer, hardcoded not configurable**: the assistant system prompt says *"an assistant for a cooling tower maintenance field-ops company"* (`api/assistant/chat/route.ts:87`) and the summarizer says *"voice notes from cooling tower maintenance visits"* (`lib/ai/voice-note.ts:23`). These are string literals in code, not derived from `BusinessProfile` (which already stores `name` and could carry a trade descriptor). So the moment AI features shipped, a trade-specific assumption re-entered the system **as behavior**, not just copy. UI copy (`layout.tsx`, sign-in pages) is cosmetic; the prompt strings are the ones that actually shape output for another trade.

### 6. AI feature integration — shared plumbing, bespoke assembly

There *is* a nascent common substrate: one client singleton (`lib/ai/client.ts`), one cost helper (`lib/ai/cost.ts`), and one audit table (`AiAuditLog`). That's more coherence than most codebases at this stage. But there is **no "AI call" abstraction that ties client + invocation + cost + audit together**, so each feature re-assembles it differently and inconsistently:

- **Audit logging is copy-pasted three times with three shapes/transaction semantics.** Assistant logs `toolCalls` and writes the audit row *outside* any transaction (`api/assistant/chat/route.ts:123-132`); voice-note-send writes it *inside* a `$transaction` alongside the update (`.../send/route.ts:45-58`); the finalize cron writes it inside a `Promise.all` per note (`api/cron/finalize-voice-notes/route.ts:34`). The validate feature doesn't log at all (§4). So audit completeness and atomicity differ per feature — exactly the kind of thing you want uniform for cost governance.
- **Model IDs are hardcoded string literals** in each caller (`"claude-sonnet-5"` in the assistant route, `"claude-haiku-4-5"` in `voice-note.ts` and again in `.../send/route.ts:43`), duplicated against the pricing map in `cost.ts:2-3`. A model rename touches several files and can silently desync from the pricing table (`calculateCostUsd` throws on unknown model — so a rename is a runtime failure, not a type error).
- **Invocation styles diverge** with no shared wrapper: the assistant hand-rolls a 5-round tool-use loop inline in the route (`chat/route.ts:82-119`), voice-note uses `output_config` structured output in a lib function, validate uses pure rules. Each is reasonable individually; there's just no "AI feature" concept unifying them.

Bottom line: the *primitives* are shared, the *orchestration* is bespoke and slightly inconsistent per feature.

### 7. Recommendations (ranked by leverage)

1. **Centralize authorization into a single permission matrix.** Replace the ~20 inline `requireRole([...])` literals and the duplicated `visibleTo` arrays with one `permissions.ts` mapping capability → roles, consumed by *both* API guards and `nav-config`. Eliminates the four-way duplicated compliance array, kills the nav/API drift risk, and makes adding a role a one-file change. Highest leverage as roles and features grow.
2. **Standardize the route contract via one wrapper.** A `defineRoute({ roles, schema, handler })` (or a small `withAuth` + shared `validate`/`respondError`) that fixes: 401-vs-403 semantics, a single error-body shape, one validation-failure status, extracted schemas everywhere, and centralized `Decimal` serialization. Removes the three competing idioms in §2 in one move.
3. **Introduce a thin AI service seam.** One `runAiCall({ feature, model, ... })` that owns client access, cost calculation, and the `AiAuditLog` write atomically, plus a single model→pricing registry. Fold the cooling-tower system prompts into config derived from `BusinessProfile` so the trade-agnostic goal is actually honored at the AI layer (§5). Makes audit/cost tracking uniform and closes the "validation never logs" gap.
4. **Reconcile dead surface area.** Remove the `draftsman` role end-to-end (or formally re-scope it), and either implement the LLM tier of `/api/ai/validate` per its plan or drop the `AiFeature.validation` enum value. Small, but removes live confusion and a never-fired code path.
5. **Extract a domain-service layer for multi-step operations** (variation-submit-with-push, voice-note-send-summarize-index) so the API route and the AI assistant tool call the *same* function — eliminating the already-visible divergence between `api/variations/route.ts` and `lib/assistant/tools/draft.ts` — and decompose the largest client controllers (`ScheduleGrid`, `JobsClient`, `CustomerDetail`) as they're touched.

**Key files:** `src/lib/auth/clerk.ts`, `src/lib/nav-config.ts` (dual RBAC definition); `src/app/api/{jobs,customers,settings,variations}/route.ts` (competing route idioms); `src/lib/ai/{client,cost,voice-note,validate-job}.ts` + `src/app/api/{assistant/chat,ai/validate,jobs/[id]/voice-notes/[voiceNoteId]/send}/route.ts` + `src/app/api/cron/finalize-voice-notes/route.ts` (bespoke AI assembly, inconsistent audit); `prisma/schema.prisma:76,418-431` (dead `validation` feature, job-coupled `DocumentChunk`); `src/lib/assistant/tools/draft.ts` (duplicated variation logic).

---

## Security Architect Review

Scope: Clerk auth layer, all `src/app/api/**/route.ts` handlers, upload/blob routes, the new AI assistant (`assistant/chat`, `lib/assistant/*`, `lib/ai/*`), raw SQL, and secrets handling. Findings below are ranked by real exploitability. This is a single-organization app (all authenticated users are employees of one company), so "IDOR" here means one employee reaching another employee's or another job's data, not multi-tenant cross-customer leakage.

### Summary of posture

The codebase is, overall, notably disciplined for its stage: every API route except `/api/health` performs an auth check, `requireRole` is applied consistently, all raw SQL is properly parameterized, and the AI draft actions are correctly bounded to non-approving statuses with independent role gating. The findings below are real gaps but none is a trivially-exploitable critical hole. The two worth fixing before real customer data lands are the blob-proxy authorization gap and the AI read-tool scope inconsistency.

### Authentication & Authorization

Clerk integration is sound. `getSessionUser` (`src/lib/auth/clerk.ts:14-68`) resolves the Clerk `userId`, maps to the DB user, enforces `isActive`, and fails closed (returns `null` on any exception). `requireRole` (`:70-75`) throws `Unauthorized`/`Forbidden` and every route wraps it in `.catch(() => null)` → 401. Role source is Clerk `publicMetadata.role` (admin-controlled, not user-editable), consistent between the JIT path and the Clerk webhook (`src/app/api/webhooks/clerk/route.ts:42-45`), which correctly whitelists roles.

- No route is missing an auth check. `/api/health` (`route.ts:6`) is unauthenticated but only runs `SELECT 1` — acceptable.
- Middleware (`src/middleware.ts`) fails closed via `auth.protect()` for everything not explicitly public. The public list is defensible except one stale entry — see Low findings.
- **No privilege-escalation path found in the draft tools.** `draftVariation` re-checks `["director","service_manager","admin"]` and `draftQuote` re-checks `["admin","director","sales_engineer"]` from `callingUser.role` (`src/lib/assistant/tools/draft.ts:11-12,18,56`), independent of anything the model says. Technicians cannot reach the chat route at all (`src/app/api/assistant/chat/route.ts:43`). Good.

### Data access control / IDOR

Resource-by-ID routes fall into two correct patterns: (a) office-role resources (jobs, quotes, customers, invoices, materials, assignments) are role-gated and intentionally company-wide for those roles — not IDOR; (b) technician-scoped resources correctly verify ownership/assignment:
- `jobs/[id]/voice-notes` POST checks job-active + `assignment` for the calling user + `isOwnedBlobUrl(audioUrl, user.id, "voice-notes")` (`route.ts:19-27`).
- `voice-notes/[voiceNoteId]/send` scopes the note by `technicianId: user.id` and validates every photo URL ownership (`route.ts:27-33`).
- `jobs/[id]/communications` GET gives technicians only `field_instruction` rows and only when assigned (`route.ts:15-25`).
- Assistant chat sessions are scoped: `findFirst({ where: { id: sessionId, userId: user.id } })` (`assistant/chat/route.ts:54`) — no cross-user session hijack.
- Customer portal tokens are 32-byte random hex with expiry check (`src/lib/portal/getCustomerForToken.ts:9-11`) — strong.

**HIGH — `/api/photos` proxies any app blob with no per-resource authorization** (`src/app/api/photos/route.ts:3-24`). It authenticates the caller (any role), then fetches an arbitrary caller-supplied `url` using the powerful `BLOB_READ_WRITE_TOKEN`, validating only that the hostname ends in `.blob.vercel-storage.com` (`:18`). There is no check that the requesting user is entitled to that specific blob. This is deliberate (a director must view a technician's photo stored under `variations/<technicianId>/…`, so `isOwnedBlobUrl` can't be used here), but the result is that any authenticated employee can retrieve any private voice-note audio/video or variation photo in the entire store if they know or can guess the URL. Blob paths are structured (`variations/<userId>/<timestamp>.jpg`, `voice-notes/<userId>/<timestamp>.<ext>`) — the only secrecy is Vercel Blob's random suffix. If `put()`'s random suffix is ever disabled, or a URL leaks via logs/referrer/a shared response, this becomes trivially enumerable horizontal access to other employees' media. Recommend: look the URL up in the DB (VoiceNote/VoiceNotePhoto/Variation) and verify the caller's role/assignment grants access to the owning resource, rather than trusting hostname alone.

### AI-specific risks

**HIGH/MEDIUM — the assistant read tools broaden data scope beyond a role's direct-API permissions.** `semanticSearchTool` returns `chunkText` from `JobCommunication` and `VoiceNote` across *all* jobs with no per-role scoping (`src/lib/assistant/tools/read.ts:103-106`, `src/lib/ai/semanticSearch.ts:37-61`). The chat route admits `sales_engineer` (`assistant/chat/route.ts:43`), but the direct communications API restricts reads to `admin/director/service_manager` + assigned technician (`jobs/[id]/communications/route.ts:7,10`) — `sales_engineer` is excluded there. So a sales engineer can read job-communication and voice-note transcript content through the assistant that they are denied through the normal API. `findJobs`/`findAssignments`/`findComplianceDocuments` are similarly unscoped. Recommend deriving each read tool's filter from `callingUser.role` (pass it into `dispatchTool` for read tools too) so the AI cannot exceed the caller's own data boundary.

**MEDIUM — indirect prompt injection can drive autonomous draft creation.** Voice-note transcripts and job communications are indexed into `DocumentChunk` (`jobs/[id]/communications/route.ts:61`, `voice-notes/[voiceNoteId]/send/route.ts:73`) and fed back to the model verbatim via `semanticSearchTool`. A technician (or anyone who can get text into a transcript/communication) can embed instructions that steer the model to call `draftVariation`/`draftQuote`. The blast radius is correctly bounded — drafts are created with `status: "pending"`/`"draft"` (`draft.ts:45,70`), never auto-approved (approval requires a director on `variations/[id]/decision`), role is enforced from `callingUser` not the model, and `draftVariation` still requires the named technician to be genuinely assigned (`draft.ts:22-37`). But there is no human-confirmation step before the model autonomously writes a `Variation`/`Quote` row within a turn, so injected content can still cause spurious/junk drafts and token spend. Recommend: treat model-proposed drafts as a proposal returned to the UI for one-click human confirmation rather than a direct DB write, and/or wrap tool-supplied free text with a delimiter and instruct the model to never treat retrieved content as instructions.

**No path from model tool-args to raw SQL or an unvalidated blob op.** `semanticSearch` passes `jobId`/`query`-derived vectors as bound parameters only; the draft tools use the Prisma query builder. Good.

### Injection risks

**No SQL injection.** Every `$queryRawUnsafe`/`$executeRawUnsafe` uses positional bound parameters (`src/lib/ai/semanticSearch.ts:16-25, 46-60`). The one interpolated string, `vectorLiteral` (`:14,43`), is built from a numeric embedding array returned by Voyage (`embedding.join(",")`), never from user text, and is itself passed as a bound `$1`/`$5` param cast to `::vector` — not concatenated into the statement. `/api/health` uses a tagged template (`` $queryRaw`SELECT 1` ``). No shell/`child_process` usage anywhere. No `dangerouslySetInnerHTML`. No XSS surface found.

### File upload / blob storage

- `isOwnedBlobUrl` (`src/lib/blob/ownership.ts`) correctly parses the URL, checks `hostname.endsWith(".blob.vercel-storage.com")` (defeats the substring-bypass SSRF), and requires the path prefix `/${folder}/${userId}/`. Used correctly in both voice-note routes. Good.
- Upload routes enforce size caps (photo 5 MB, voice 100 MB) and an allow-list, and store under `access: "private"` with the caller's `user.id` in the path (`upload/photo/route.ts`, `upload/voice-note/route.ts`).
- **LOW — file-type validation trusts the client-supplied `file.type` MIME** (`upload/photo/route.ts:19`, `upload/voice-note/route.ts:27`, `settings/logo/route.ts:22`), not magic bytes. An attacker can store arbitrary bytes under an image/audio content-type. Impact is limited (private blobs, served back with the stored type), but worth a magic-byte sniff if these ever feed a downstream processor.

### Secrets & configuration

Clean. No hardcoded secrets. `NEXT_PUBLIC_` is used only for genuinely public values (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`). No server secret (`CLERK_SECRET_KEY`, `BLOB_READ_WRITE_TOKEN`, `ANTHROPIC_*`, `ASSEMBLYAI_*`, `DATABASE_URL`, `*_WEBHOOK_SECRET`) is imported into any `"use client"` component (verified by scan). VAPID private key stays server-side (`src/lib/push/vapid.ts`).

### Audit / logging

- AI usage is well audited: `AiAuditLog` records userId, feature, `toolCalls` (name + input), tokens, and cost per turn (`assistant/chat/route.ts:123-132`; voice summarization at `voice-notes/[voiceNoteId]/send/route.ts:55-57`).
- Auth events (login/logout) are logged via the Clerk webhook to `authEvent` (`webhooks/clerk/route.ts:64-76`).
- **MEDIUM (hygiene) — authorization *failures* are not logged anywhere.** Every `requireRole(...).catch(() => null)` silently returns 401/403 with no record, and the draft-tool role denials (`draft.ts:19,57`) return a soft error to the model with no audit entry. There is no trail of "who tried to reach what they weren't allowed to," which is exactly what you'd want for detecting probing once real data exists. Recommend logging role-check rejections (userId, route, required roles) to a security audit table.

### Other Low findings

- **Stale/misleading middleware public entry.** `src/middleware.ts` lists `/api/upload/photo` as public with the comment "Vercel Blob CDN posts onUploadCompleted without a Clerk session" — but that route does a server-side `put()` and enforces `requireRole(["technician"])` (`upload/photo/route.ts:9`); it is not an `onUploadCompleted` handler. Not exploitable (the route self-protects), but the exemption is unnecessary defense-in-depth loss and the comment is wrong. Remove it from the public matcher.
- **Non-constant-time secret comparison** in the AssemblyAI webhook: `secret !== process.env.ASSEMBLYAI_WEBHOOK_SECRET` (`voice-notes/webhook/route.ts:7`). High-entropy secret makes timing exploitation impractical; use `crypto.timingSafeEqual` for hygiene.
- **No max length on assistant `message`** (`src/lib/assistant/validate.ts:5`) — an authenticated office user can submit an arbitrarily large prompt, inflating token cost (`MAX_ROUNDS = 5`, `max_tokens: 2048` cap the response but not input). Add a reasonable `.max()`.

### Recommendations (ranked by exploitability/impact)

Must fix before this holds real customer data:
1. Add per-resource authorization to `/api/photos` — verify the caller is entitled to the specific blob (DB lookup + role/assignment), don't rely on URL secrecy (High).
2. Scope the assistant read tools (especially `semanticSearchTool`) by `callingUser.role` so the AI can't return `JobCommunication`/`VoiceNote` content to roles denied it on the direct API (High/Medium).

Should fix (bounded but real):
3. Require human confirmation before the assistant materializes a `Variation`/`Quote` row, to blunt indirect prompt injection driving spurious drafts (Medium).
4. Log authorization failures and AI tool-role denials to an audit trail (Medium).

Good hygiene, not urgent:
5. Magic-byte validation on uploads; constant-time webhook secret compare; remove the stale `/api/upload/photo` middleware exemption; cap assistant message length (Low).

Confirmed clean: no SQL injection (all raw SQL parameterized), no XSS/shell surface, no secret leakage into client bundles, AI draft actions never auto-approve or bypass role checks.

---

## UX Expert Review (Mobile & Desktop)

I reviewed the navigation shell, all major feature pages, the voice-note capture flow, and the AI assistant by reading the actual component code. The app has a coherent visual language (slate + amber, rounded cards, dark-mode-aware) and clearly had mobile in mind for technician flows. But there are several routing dead-ends, some field-hostile touch/feedback gaps, a desktop layout that mostly ignores wide screens, and an AI widget that loses its conversation on every navigation. Findings below cite specific files.

### 1. Navigation & information architecture

**Two entry-point dead-ends where a signed-in user gets bounced to `/sign-in` (same class of bug as your historical one):**

- **`sales_engineer` has no working home.** `src/app/page.tsx:8` sends every non-technician to `/dashboard`. `src/app/dashboard/page.tsx:16` only allows `director/service_manager/admin` and redirects everyone else to `/time-tracking`. But `src/app/time-tracking/page.tsx:8` (`requireRole(["technician","service_manager","director"])`) excludes `sales_engineer`, so line 9 redirects to `/sign-in`. Net effect: a signed-in sales engineer hitting `/` bounces `/` → `/dashboard` → `/time-tracking` → `/sign-in`. Their nav items (Jobs, Quotes, Customers, Compliance) all work, but they can never land anywhere by default — they'd assume they're logged out.
- **`admin` sees a "Time tracking" nav link that dead-ends.** `src/lib/nav-config.ts:58` lists `admin` in `visibleTo` for Time tracking, but `src/app/time-tracking/page.tsx:8` omits `admin`, so an admin clicking that nav item is redirected to `/sign-in`. A visible nav link that logs you out is exactly the discoverability/dead-end failure to avoid.

**Dead affordances in the top bar.** `src/components/nav/TopBar.tsx:25-36` renders a Search icon and a Notifications bell on *every* page. Neither has an `onClick` — they do nothing. The Search icon is especially misleading because real search exists only locally (Customers, Quotes), implying a global search that isn't there; the bell implies notifications while `PushRegistrar` exists but nothing surfaces them in-app.

**Otherwise IA is sound:** Templates is linked from Compliance (`src/app/compliance/page.tsx:37`) and gated to admin; Invoices is reachable from both nav and job detail (`src/app/jobs/[id]/page.tsx:87`); Customers detail links from the list. No orphaned pages beyond the routing bugs above.

### 2. Mobile experience (technician-facing)

- **Voice recording loses the recording on a failed upload.** `src/app/time-tracking/VoiceRecorder.tsx:98-101` — on upload failure the user gets "Failed to upload voice note. It was not saved." and the in-memory blob is gone. For a tradie outdoors on poor signal (an explicit use case), a long recording is unrecoverable with no retry and no local save. This is the highest field-risk item in the app. *(Already queued as a follow-up: [[project-voice-note-video-followups]] — camera flip, delete-before-upload, preview-before-submit; this finding adds "keep the blob and retry on upload failure" to that list.)*
- **Sub-44px touch targets in glove-relevant flows.** Audio/Video mode toggle is `min-h-[32px]` (VoiceRecorder.tsx:126/133); the "Add photo" button (PendingVoiceNoteReview.tsx:144-152) has no min height and pairs a 14px icon with `text-xs`; Materials reconcile input+button are `min-h-[32px]` (JobsClient.tsx:312/317); Schedule mobile "Assign"/confirm buttons are `min-h-[32px]` (ScheduleGrid.tsx:275,215). The primary Clock In/Out (52px) and Record (48px) buttons are correctly sized — the problem is the secondary controls.
- **Pinch-zoom is disabled globally.** `src/app/layout.tsx` viewport sets `maximumScale: 1, userScalable: false`. Combined with heavy use of `text-2xs`/`text-xs`, an outdoor technician can't zoom to read small text — a WCAG 1.4.4 failure and a practical field problem.
- **Voice recorder has no review-before-send for the media itself.** You can review the *transcript* later (PendingVoiceNoteReview), but there's no playback/re-record of the audio/video before it uploads (VoiceRecorder.tsx:104-116 jumps straight to "done"). *(Also queued in [[project-voice-note-video-followups]].)*

### 3. Desktop experience (office/management)

- **Almost every management page is a narrow centered mobile column.** Jobs `max-w-2xl` (jobs/page.tsx:52), Compliance `max-w-2xl`, Variations `max-w-lg`, Team `max-w-2xl`, Dashboard `max-w-3xl`, Customers/Invoices `max-w-4xl`, Quotes `max-w-5xl`. On a 1440px screen the data-dense Jobs list renders a single 672px column of cards with ~half the viewport as whitespace. Only the Schedule grid (`schedule/page.tsx:119`, full-width) actually uses desktop real estate — so the desktop experience is internally inconsistent and mostly feels like a stretched phone.
- **Two list paradigms for the same kind of data.** Jobs is a vertical stack of cards (JobsClient.tsx:457) while Customers/Quotes/Invoices are proper tables. On desktop the card list is far less scannable than a table for a manager scanning many jobs.
- **Dashboard stacks single-column** (`dashboard/page.tsx:20`, `max-w-3xl` with Assistant → CrewBoard → HoursOverview stacked) when a two-column layout would suit a wide "live overview."

### 4. Consistency

- **Primary-button color is not standardized:** amber-500 (JobsClient "New job" :448, EditJobModal Save :94, Compliance "New document") vs amber-600 (Clock In :146, ChatWidget send, Quotes "Search" :144, PendingVoiceNote "Send" :158). Two different "primary" ambers across features.
- **Modal pattern is otherwise consistent and good** — the `items-end sm:items-center` bottom-sheet-on-mobile pattern with `rounded-2xl max-w-md` is reused across Edit/Communication/Materials/New Job modals. The AI ChatWidget breaks it (`rounded-xl`, fixed-position panel).
- **No shared toast/feedback system** (grep confirms zero toast/sonner usage). Every success is silent and every error is a locally-rendered `<p className="text-red-600">`, so feedback conventions are re-implemented per component and success feedback is largely absent.

### 5. Feedback & error handling

- **Job delete has no feedback at all.** `src/app/jobs/JobsClient.tsx:352-357`: `await fetch(DELETE); router.refresh()` with no error check and no success confirmation. If the delete fails (e.g. the P2025 case referenced in recent commits, or a network drop), the card silently reappears after refresh and the manager can't tell whether it worked.
- **Silent failures elsewhere:** Materials reconcile only acts on success (`if (res.ok) load()`, JobsClient.tsx:267) — a failure shows nothing. Schedule drag-and-drop reverts the optimistic move on failure (ScheduleGrid.tsx:388) with no message, so the block just snaps back with no explanation.
- **Generic error copy that misattributes cause.** `src/app/error.tsx` renders "Something went wrong / Your session may have expired" for *all* non-redirect errors — a real application bug is presented to the user as an expired session, pushing them to sign out unnecessarily. The ChatWidget throws away the server's error (`throw new Error("Request failed")`, ChatWidget.tsx:41) and always shows "Failed to send. Try again."
- **Good examples exist and should be the template:** Clock-in/out surfaces the server's `data.error` (ClockCard.tsx:47-48), and CrewBoard shows a clear "Failed to refresh — check your connection" (CrewBoard.tsx:62).

### 6. Accessibility basics

- **Four icon-only buttons with no label and ~26px targets.** The JobCard action row (JobsClient.tsx:381-392) has Receipt/MessageSquare/Pencil/Trash2 buttons, all `p-1.5` with `w-3.5` icons and **no `aria-label` and no `title`**. Screen-reader users get nothing, sighted users can't tell that "Receipt" means Materials & costs, and the targets are crowded next to the status badge on mobile.
- **Hover-only destructive control.** Desktop schedule delete is `hidden group-hover:flex` (ScheduleGrid.tsx:99) — unreachable by keyboard and by touch on a touchscreen laptop/tablet at `md` width.
- **Low-contrast secondary text everywhere.** `text-slate-400` on white (~2.8:1, fails AA) is used for dates, "optional", "No invoice yet", "—" placeholders, etc. across job detail, quotes, and variation cards.
- **AI chat has no live region** — new assistant replies and the "Thinking…" state (ChatWidget.tsx:73) aren't announced; the input has only a placeholder, no label.
- **Positives:** the clock-in select has an `sr-only` label (ClockCard.tsx:126), the mobile menu buttons are 44px with labels, and voice-note images have alt text (though a generic "Attached").

### 7. The AI assistant UX specifically

- **The conversation is destroyed on every navigation.** `AppShell` (and therefore `AssistantBubble` → `ChatWidget`) is imported per-page rather than in the root layout (`src/app/layout.tsx` does not render it; every page wraps itself in `AppShell`). `ChatWidget` holds `messages` and `sessionId` in local `useState` (ChatWidget.tsx:17-18), so navigating from, say, Jobs to Customers fully remounts the widget and wipes the chat. There is consequently **no way to see or return to past conversations, and you even lose the current one just by clicking a nav link.**
- **Failed sends lose the user's text.** `send()` clears the input immediately (ChatWidget.tsx:33) and pushes the user message, but on error only sets an error string — there's no retry button and the typed message can't be re-sent without retyping.
- **No viewport-height safety.** The panel is a fixed `h-[480px]` (ChatWidget.tsx:53) pinned `bottom-4 right-4`. On a short/landscape phone or with the soft keyboard open it can't shrink, and `w-80` (320px) + `right-4` slightly overflows the narrowest phones. The send button is `min-h-[40px]` (below 44px) and the composer is a single-line `<input>` with Enter-to-send and no shift+enter, so multi-line questions are awkward.
- **The interaction model is otherwise clear** — bubble → panel, a helpful empty-state prompt (line 64), and a "Thinking…" indicator. The inline-on-dashboard vs floating-bubble split (AssistantBubble.tsx) is reasonable.

### 8. Recommendations (ranked by impact)

1. **Fix the two routing dead-ends.** Give `sales_engineer` a real default landing page (e.g. `/jobs`) instead of bouncing through `/dashboard` → `/time-tracking` → `/sign-in`, and either remove `admin` from Time tracking's `visibleTo` (nav-config.ts:58) or add `admin` to the page's `requireRole` (time-tracking/page.tsx:8). A signed-in user should never be redirected to sign-in from a visible nav link.
2. **Make voice-note capture resilient to bad signal.** Keep the recorded blob after a failed upload and offer Retry (VoiceRecorder.tsx:98) — ideally queue/persist locally. This directly addresses the "poor signal in the field" use case and prevents lost work.
3. **Add real feedback to silent actions, starting with job delete.** Wrap `deleteJob` (JobsClient.tsx:352) in error handling and introduce one shared toast/confirmation mechanism used by delete, materials-reconcile, and schedule-drag-revert so users always know whether an action succeeded.
4. **Persist the AI conversation across navigation** (lift state above the per-page `AppShell`, or hydrate from the server session via `sessionId`) and add a resend/retry on failed messages. Without this the assistant can't hold a multi-step conversation while the user moves around the app.
5. **Label and enlarge the JobCard icon buttons.** Add `aria-label`/`title` to the four actions (JobsClient.tsx:381-392) and bump their tap target toward 44px — fixes both accessibility and "what does this icon do" discoverability in one change.
6. **Use desktop width on management pages.** Widen or two-column the data-dense views (Jobs, Dashboard, Quotes) at `lg:` instead of capping at `max-w-2xl/3xl`, and consider a table layout for Jobs to match Customers/Quotes/Invoices.
7. **Remove or wire up the TopBar Search and Bell** (TopBar.tsx:25-36) so the app doesn't advertise capabilities it doesn't have.
8. **Re-enable pinch-zoom** (drop `maximumScale/userScalable` in layout.tsx) and raise the many `text-slate-400` secondary texts to at least `slate-500` for AA contrast — both are quick wins that matter most for outdoor phone use.

---

## Database Expert Review

Scope: `prisma/schema.prisma` (519 lines, 27 models), all 22 migrations under `prisma/migrations/`, and the query layer under `src/app/api/**` and `src/lib/ai/`.

### 1. Schema design quality

**Relations & cardinality are mostly sound.** Foreign keys are declared for every relation, join tables use proper composite PKs (`JobAsset` `@@id([jobId, assetId])`, schema line 338), and the money columns are correctly `Decimal(12,2)` throughout (`Invoice`, `Variation.costEstimate`, `MaterialEntry`, `Contract.value`, `Quote.totalAmount`, `Job.quotedCost`) rather than `Float`. `AiAuditLog.costUsd` uses `Decimal(10,6)` (line 382), appropriate for fractional-cent AI costs. Enums are used well for closed vocabularies (statuses, roles, cadences).

**Denormalization that isn't justified — the main design smell.** `Job` carries free-text `customerName`, `siteName`, `siteAddress` (lines 138-140) *and* a nullable `customerId` FK to `Customer` (line 145/158). Once a job is linked to a customer, `Job.customerName` and `Customer.name` can silently diverge — nothing keeps them in sync, and there's no stated performance reason (the customer name is a cheap join). Worse, `customerId` is nullable, so the free-text field is load-bearing and can't be dropped. `Quote` (lines 485-503) repeats this with `customerName`/`siteName` as free text and **no** `customerId` FK at all, so quotes can't be reliably rolled up to a customer. `Contract.siteName` (line 469) similarly duplicates site identity that arguably belongs to an `Asset`/site entity. This is drift-by-design and will bite reporting.

**Minor type issues.** `Job.quotedHours` (line 142) and `BusinessProfile.hourlyRate` (line 249) are `Float`; hours-as-float is defensible, but `hourlyRate` feeds money math and would be safer as `Decimal`. `VoiceNote.transcript` is nullable (line 440) yet the finalize cron dereferences it with `note.transcript!` (`src/app/api/cron/finalize-voice-notes/route.ts:26`) — a nullability contract enforced only by an app-side `!`.

### 2. Indexing

**Missing indexes on foreign keys that are actually filtered/joined:**
- `Job.customerId` — no `@@index` (schema lines 145-165 declare only `status`, `jobType`). The customer detail route loads a customer's jobs, and `Job.contractId` (line 159) is likewise unindexed despite `Contract → generate-job` traversal. Both FKs will do sequential scans and slow any cascade.
- `Variation.technicianId` (line 202) — indexed on `status` and `jobId` only (215-216), not `technicianId`, though `User → variations` is a declared relation.
- `MaterialEntry.createdById`, `JobCommunication.authorId`, `VoiceNote.technicianId` — all FKs with no supporting index (only their `jobId`/`status` are indexed).

Unindexed FKs matter beyond query speed: Postgres takes a full-table scan on the child to validate every parent `DELETE`/`UPDATE`.

**Redundant indexes:**
- `Invoice`: `jobId` is both `@unique` (line 221) and `@@index([jobId])` (line 237). The unique constraint already creates a btree index; the explicit `@@index` is dead weight.
- `JobCommunication`: `@@index([jobId])` (line 516) is fully covered by the composite `@@index([jobId, type])` (line 517) as a left-prefix — the standalone one is redundant.
- `TimeEntry.@@index([status])` (line 194) is low-value given the more selective `[userId,status]` and `[jobId,status]` composites also exist; keep it only if you run "all active entries" globally (you do — `crew/live` — so this one is justified).

**Missing vector index — see §6.**

### 3. Migration history & hygiene

Migrations are incremental and mostly clean, but there are two documented episodes of drift worth flagging:

- **`20260708000001_invoice_v2` was hand-written and diverged from Prisma's conventions** — it used `TIMESTAMPTZ` + `DEFAULT NOW()` where Prisma expects `TIMESTAMP(3)` + `@updatedAt`. This was then corrected inside `20260708063030_add_customer_model/migration.sql` (the "corrects drift from hand-written invoice_v2" block). Bundling a schema-drift correction into an unrelated feature migration (customer model) is poor separation — the fix is discoverable only by reading an unrelated migration. The correction's own comment concedes it's "safe on UTC-timezone Neon instances," i.e. it's environment-dependent.
- **Shadow constraint invisible to the schema.** `20260706140344_security_db_fixes` adds a partial unique index via raw SQL: `CREATE UNIQUE INDEX ... "one_active_entry_per_user" ON "TimeEntry"("userId") WHERE status = 'active'`. This is a *good* use of raw SQL (Prisma can't express partial uniques declaratively), but it exists only in the DB, not in `schema.prisma`. Anyone reading the schema won't know this invariant exists, and a future `prisma db pull`/round-trip won't represent it. Same category as the `Unsupported("vector(1024)")` column — legitimate, but the schema is now an incomplete description of the database.
- `migration_lock.toml` is clean (`postgresql`, unedited).

### pgvector migration soundness (`20260709060218_add_ai_assistant/migration.sql`)

- `CREATE EXTENSION IF NOT EXISTS vector;` — correctly idempotent; safe to replay.
- `embedding vector(1024) NOT NULL` created as a plain column; the model maps it via `Unsupported("vector(1024)")` (schema line 424) — the only viable approach since Prisma can't type `vector`.
- FKs are all `ON DELETE RESTRICT` (`ChatSession→User`, `ChatMessage→ChatSession`, `DocumentChunk→Job`). RESTRICT on `DocumentChunk.jobId` means **a Job can never be deleted while it has indexed chunks** — combined with the many other RESTRICT relations on `Job` (all 9 FKs into Job in the init migration are RESTRICT), jobs are effectively undeletable without manual cleanup. The `cron/cleanup-jobs` route will hit this.
- **No vector index in the migration** (confirmed: no `ivfflat`/`hnsw`/`USING` anywhere in `prisma/migrations/`). See §6.
- Rollback: Prisma has no down-migrations, and the extension is never dropped — acceptable for this workflow but worth noting the migration isn't reversible.

### 4. Query patterns / N+1 risk

**No genuine N+1 loops found.** The list routes use a single `findMany` with `include`/`select` rather than per-row fetches — e.g. `crew/live/route.ts:9`, `schedule/assignments/route.ts:24`, `invoices/route.ts:9`, `jobs/assigned/route.ts:15`, `compliance/documents/route.ts:18` all fan out via one query with scoped `select`. Nested selects are narrow (only the columns rendered), which is good.

The one loop of note is `cron/finalize-voice-notes/route.ts:24` — sequential `await` per stale note, but each iteration is an external AI summarization call, not a DB N+1; fine for an hourly cron.

**Write-path coupling to an external API.** `indexDocument` is called *inline* in the request path for both new communications (`jobs/[id]/communications/route.ts:61`) and voice-note send (`.../voice-notes/[voiceNoteId]/send/route.ts:73`). Each POST now blocks on a Voyage embedding HTTP call before responding. It's wrapped in try/catch (failure is logged, not fatal — good), but it adds latency and an external dependency to every write. This belongs on a queue/background job.

### 5. Raw SQL usage

All raw SQL lives in `src/lib/ai/semanticSearch.ts` plus the health check and backfill script.

- **Parameterization is correct.** Both `semanticSearch` branches (lines 46-52, 55-60) and `indexDocument` (lines 16-25) use positional `$1/$2/$3` bind parameters via `$queryRawUnsafe`/`$executeRawUnsafe` — no string interpolation of user input. The `::vector` casts are applied to bound params, so the `Unsafe` variant is safe here.
- **Vector literal construction** (`[${embedding.join(",")}]`, lines 14, 43) interpolates the embedding array into a string, but the source is the Voyage API returning numeric floats, so injection risk is negligible. Still, it is the one spot not going through a bind param.
- **NULL/empty handling is fine** — an empty `DocumentChunk` table returns `[]`; `distance` is always non-null for a valid vector comparison; `semanticSearchTool` maps `relevance: 1 - distance` (`tools/read.ts:105`) without dividing or dereferencing anything nullable.

### 6. pgvector-specific design

- **Chunking/polymorphism is reasonable.** `DocumentChunk` (schema 418-431) stores `sourceType`/`sourceId` as a polymorphic reference plus a denormalized `jobId` FK for scoped search — that denormalization *is* justified (it lets the job-scoped query filter on an indexed column, `WHERE "jobId" = $2`, instead of joining back through the polymorphic source). `@@index([sourceType, sourceId])` supports dedup/lookup.
- `vector(1024)` matches Voyage's output dimension; cosine distance via `<=>` with `ORDER BY ... LIMIT` is the textbook kNN pattern. Reasonable.
- **The critical gap: no ANN index on `embedding`.** Every `semanticSearch` call is a sequential scan of the whole `DocumentChunk` table plus a full sort on `<=>`. Fine at today's volume, but this is *the* thing that degrades first. Because it needs the `vector_cosine_ops` opclass, it can't be declared in `schema.prisma` and must be a raw-SQL migration, e.g. an HNSW index (`CREATE INDEX ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops);`). Note that for the global (no-`jobId`) branch a plain HNSW index applies directly; for the job-scoped branch you'd ideally want the filter to stay selective (partial or composite strategy), but a single HNSW index plus the existing `jobId` index is a fine start.
- **No dedup/upsert — duplicate embeddings accumulate.** `indexDocument` always `INSERT`s (line 16); re-sending an edited voice note or re-running the backfill creates a *second* chunk for the same `(sourceType, sourceId)` rather than replacing it. There's no unique constraint on `(sourceType, sourceId)` to stop it, and the backfill's dedup (`scripts/backfill-embeddings.ts`) keys only on `sourceId`, ignoring `sourceType`. Over time semantic search returns stale/duplicate results.

### 7. Data integrity

Good DB-level invariants already present: `one_active_entry_per_user` partial unique (raw SQL), `Invoice.jobId @unique`, `Assignment @@unique([userId, jobId, assignedDate])`, `VoiceNote.assemblyaiId @unique`, `User.email`/`clerkId @unique`.

Invariants left to application code that should be DB constraints:
- **`DocumentChunk (sourceType, sourceId)` should be `@@unique`** — currently only an `@@index`, so nothing prevents the duplicate-chunk problem in §6.
- **`Job.customerName` vs `Customer.name` consistency** — no constraint; enforced by nothing.
- **`Customer.email` is not unique** (schema 121) — duplicate customer records are possible; likely should be a unique (or partial-unique-where-not-null) constraint.
- **No `CHECK (amount >= 0)`** on any money/quantity column (`costEstimate`, `quotedHours`, `totalAmount`, `MaterialEntry.quantity`) — negatives are insertable.
- **`VoiceNote`**: no `CHECK` tying `status = 'transcribed'` to `transcript IS NOT NULL`, yet code assumes it (`note.transcript!`).

### 8. Scalability outlook

Ranked by what breaks first:

1. **`DocumentChunk` sequential scan** (no ANN index) — degrades on every AI search as voice notes/communications accumulate; also the table is append-only with duplicates and **no pruning strategy**.
2. **Unbounded `findMany` list endpoints** — `invoices`, `compliance/documents`, `customers`, `variations`, `contracts`, `assets` all `findMany` with `orderBy` but **no `take`/pagination** (only `quotes/search/route.ts:37` has `take: 50`). These return the entire table per request and grow with the business.
3. **Append-only audit/log tables with no retention** — `AiAuditLog`, `AuthEvent`, `ChatMessage`, `DocumentChunk` accumulate forever.
4. **Unindexed FK scans** (§2) on `Job.customerId`/`contractId` etc. as job volume grows.

### 9. Recommendations (ranked by impact/risk)

1. **Add an HNSW (or IVFFlat) index on `DocumentChunk.embedding` via a raw-SQL migration.** Highest leverage for the AI features; low risk. Highest-impact single change.
2. **Add `@@unique([sourceType, sourceId])` on `DocumentChunk` and make `indexDocument` delete-then-insert (or upsert) for a source.** Fixes duplicate/stale embeddings and the backfill's `sourceId`-only dedup. Low risk.
3. **Add indexes on the unindexed FKs** — `Job.customerId`, `Job.contractId`, `Variation.technicianId`, `MaterialEntry.createdById`, `JobCommunication.authorId`, `VoiceNote.technicianId`. Pure win for joins and cascade validation. Low risk.
4. **Paginate the unbounded list routes** (`invoices`, `compliance/documents`, `customers`, `variations`, `contracts`, `assets`) with `take`/cursor. Medium effort, prevents a slow-cliff.
5. **Resolve the `Job`/`Quote` customer denormalization.** At minimum add `Quote.customerId`; ideally make `Job.customerId` the source of truth and treat `customerName` as a nullable snapshot (or drop it). Medium risk — touches write paths.
6. **Drop the two redundant indexes** — `Invoice.@@index([jobId])` (covered by the unique) and `JobCommunication.@@index([jobId])` (covered by `[jobId,type]`). Trivial, reduces write overhead.
7. **Move `indexDocument` off the synchronous write path** onto a background job/queue so communication and voice-note POSTs don't block on the Voyage embedding call.
8. **Add DB-level guards**: `CHECK (amount >= 0)` on money/quantity columns, a `Customer.email` partial-unique, and a retention/pruning plan for `AiAuditLog`/`AuthEvent`/`DocumentChunk`. Also consider documenting the shadow `one_active_entry_per_user` index and the `vector` column in a schema comment so the schema file stops under-describing the DB.

Files cited: `prisma/schema.prisma`; migrations `20260708000001_invoice_v2/`, `20260708063030_add_customer_model/`, `20260706140344_security_db_fixes/`, `20260709060218_add_ai_assistant/`; `src/lib/ai/semanticSearch.ts`; `scripts/backfill-embeddings.ts`; `src/app/api/jobs/[id]/communications/route.ts:61`; `src/app/api/jobs/[id]/voice-notes/[voiceNoteId]/send/route.ts:73`; `src/app/api/cron/finalize-voice-notes/route.ts:24-26`; list routes under `src/app/api/{invoices,customers,compliance/documents,variations,contracts,assets}/route.ts`.

---

## Cross-Cutting Themes

A few findings surfaced independently across multiple reviewers, which is a stronger signal than any single report:

- **RBAC is defined in too many places at once.** The Solution Architect flagged duplicated `requireRole` arrays and a parallel `nav-config.ts` permission list; the UX reviewer independently found two concrete symptoms of that same drift (`sales_engineer` and `admin` both hitting dead-end redirects because a role list in one file doesn't match another). These are the same root cause found from two different angles.
- **The AI assistant's data scope doesn't match the rest of the app's access control.** The Security reviewer found `semanticSearchTool`/`findJobs`/etc. are unscoped by caller role, while the Solution Architect separately noted the assistant's tools re-implement business logic (like variation creation) independently of the "real" API routes rather than sharing it — both point at the same gap: the assistant was built as a parallel path into the data rather than going through the same authorization-aware logic as everything else.
- **Silent failure is a recurring pattern**, not a one-off: the UX review's "job delete has no feedback" and "materials reconcile fails silently" pair with the Security review's "authorization failures aren't logged" — errors are swallowed at both the UI layer and the audit layer.
- **`DocumentChunk` (the new pgvector table) has two independent gaps that compound**: the Database review's missing ANN index (query-time cost) and missing dedup constraint (data-quality cost) both stem from the same root cause — this table was added quickly to ship the AI assistant and hasn't had a second pass.
