# Phase 3 — Future Scope Document

> **Status:** Not committed. These modules are recorded here to ensure the data model and architecture decisions in earlier phases don't accidentally close the door on them. No implementation timelines are set.

> **For agentic workers:** This is a forward-looking scope document, not an implementation plan. Do not implement anything from this document unless Phase 3 has been formally approved and this document has been converted to per-module implementation plans using `superpowers:writing-plans`.

---

## Context

Phase 3 represents features that are conceptually valuable but not part of the core operational problem being solved in Phase 1 and 2. They are included here so that:

1. Data model decisions in earlier phases don't foreclose these options
2. The team can make informed prioritisation decisions when Phase 2 is complete
3. The architecture can accommodate them without a rewrite

---

## Recommended Build Sequence

The module letters above (3a–3j) reflect the order each idea was scoped in, not the order to build them in. If/when Phase 3 is greenlit, build in this order instead — it respects real dependencies, ships the cheapest/lowest-risk wins first, and groups modules that share infrastructure so it's only built once.

| Batch | Name | Modules | Why here |
|---|---|---|---|
| **a** | Quick ops win | 3a Communication Log | Tiny, independent, zero dependencies on anything else. Real, standalone pain point — safe first ship, builds momentum before anything harder. (Module 3c, Draftsman Module, was retired here — see "General-Purpose Alternatives" below.) |
| **b** | Asset foundation | 3d Asset Tracking | Standalone value (warranty tracking, service history) *and* strengthens several modules further down the list — build it before them, not after, so they aren't retrofitted. |
| **c** | Job costing | 3b Material Tracking + 3e Purchase Orders/Supplier Invoices, **combined into one module** | These two describe the same problem twice — materials/receipts arriving late, unreliable job costing — with near-identical data models (item, cost, receipt upload, reconciliation). Scope and build as a single reconciliation system. |
| **d** | Quoting | 3f Quote Generation | Closes the financial loop batch **c** opens (quote → actual job cost → invoice). Reuses `BusinessProfile` and the Phase 2a PDF pattern directly — no new infrastructure. |
| **e** | Maintenance contracts | 3k Maintenance Contracts | Turns ad hoc job creation into recurring revenue tracking. No hard dependency, but meaningfully better with Asset Tracking (b) and Quoting (d) already in place — a contract can reference specific assets and originate from an accepted quote. |
| **f** | Customer portal | 3l Customer Portal | Richer with Maintenance Contracts (e) already shipped — a portal that can show "your next scheduled visit" is far more useful than one limited to past job history alone. |
| **g** | Hybrid validation & alerts | 3g AI Validation Coworker + *(from 3j)* predictive compliance reminders + statistical anomaly detection | All three share the same rule-first, AI-explains-second philosophy and the same API route shape. This batch is where `AiAuditLog` and the `ANTHROPIC_API_KEY` convention get established — everything AI-related after this reuses them rather than reinventing them. |
| **h** | Field capture & triage | 3h Voice Notes + *(from 3j)* photo-based defect triage + auto-drafted variation/quote text | Both automations were already scoped as dependent on Voice Notes existing — ship together rather than as a later fast-follow. |
| **i** | Assistant & search | 3i AI Company Assistant + *(from 3j)* semantic search for quoting | By this point Asset Tracking (b), Voice Notes (h), and the AI conventions (g) all already exist, which is meaningfully cheaper than building the assistant first and retrofitting the rest around it. |

**Explicitly not in this sequence:** smart scheduling/technician assignment (mentioned under the old Module 3j) was already flagged as *not* an AI feature — it's a constraint-optimization problem for a scoring algorithm, not a language model. If it's ever built, it belongs on a different roadmap track entirely, with an LLM touching nothing but the plain-language explanation of a suggested assignment.

This sequence is about relative order once work starts — it doesn't override the gate in "Phase 3 — Recommended Evaluation Criteria" below.

### Sequencing flexibility — which batches can move earlier

The a→i order above optimizes for *cheapest total rework across the whole phase*, not for "nothing else may go first." Two of the three AI batches have no actual technical dependency on anything before them:

- **Batch g (Hybrid validation & alerts) can move to first, ahead of even batch a.** It works against the schema exactly as it exists today — no new model, no new vendor account beyond one Anthropic API key. This is already the standalone recommendation in "AI Modules — Free Prototyping Path" below: it's the cheapest, safest way to prove the AI-route pattern (`AiAuditLog`, env var convention, API shape) before committing bigger sessions to anything else.
- **Batch h (Field capture & triage) can also move earlier**, for the online-capture path specifically — it's independent of every other module. Only the offline/PWA fast-follow piece has a reason to wait, and that was already scoped as optional for v1, not a blocker.
- **Batch i (Assistant & search) is the one genuinely gated batch.** It needs the `pgvector` extension enabled on Neon and an embeddings vendor account set up — real setup work, not just code — and its most useful queries ("towers due next month") are meaningfully weaker without batch b (Asset Tracking) already shipped, since there'd be no real Tower entity to query against. Build b before i even if b's position in the main sequence otherwise gets reshuffled.

In short: **a–f can be reordered freely and g/h can be pulled to the front; i is the one batch that should wait for b plus its own vendor setup**, regardless of what order everything else ends up in.

---

## Module 3a — Communication Log

**The problem:** Communication about jobs happens via phone, SMS, and WhatsApp. There is no record of what was agreed, what was communicated to clients, or what instructions were given to technicians in the field. This creates liability risk and disputes.

**What Phase 3a would build:**

- A per-job communication log: timestamped notes, calls logged, client instructions recorded
- Ability to tag entries by type (client call, internal note, instruction to technician)
- Searchable log accessible to directors and admins
- Technicians can view notes tagged as "field instruction" on their own jobs

**Data model considerations (plan for in earlier phases):**

The `jobs` table should not need changes — communication log will use a new `job_communications` table:

```
job_communications
- id
- jobId
- authorId (user)
- type: "client_call" | "internal_note" | "field_instruction"
- body: text
- createdAt
```

No foreign-key changes to existing tables required.

---

## Module 3b — Material Tracking

> **Combine with Module 3e.** This module and Purchase Orders / Supplier Invoices (3e) describe the same problem from two angles — see "Recommended Build Sequence" above (batch c). Scope them together, not as two reconciliation systems.

**The problem:** Materials used on jobs are not tracked. Technicians pick up parts from the warehouse or buy them on-site and there is no record until a receipt arrives — sometimes weeks later. This makes job costing unreliable.

**What Phase 3b would build:**

- Technicians log materials used on a job (item description, quantity, estimated cost)
- Receipts can be photographed and uploaded (reuses Vercel Blob from Phase 1c)
- Admin reconciles receipts against material entries
- Material costs feed into the job's invoice record (extends `invoices` table)

**Data model considerations (plan for in earlier phases):**

A new `material_entries` table:

```
material_entries
- id
- jobId
- technicianId
- description
- quantity
- unitCost
- totalCost (computed)
- receiptUrl (nullable, Vercel Blob)
- reconciledAt (nullable)
- createdAt
```

The `invoices` table should have a `materialsTotal` column added when Module 3b is implemented (migration at that point, no need to add it earlier).

---

## Module 3c — retired

**Was:** Draftsman Module (a drawing-request queue with version tracking, scoped to the `draftsman` role).

**Retired 2026-07-08:** too specific to this business's particular niche — the goal is to keep this a general field-service platform, not one with modules hard-coded to cooling-tower/engineering-drawing workflows. The `draftsman` role stays in the `UserRole` enum (it's live, in production) — only the module *idea* is scrapped. See "General-Purpose Alternatives" below for what's proposed in its place.

---

## Module 3d — Asset Tracking

**The problem:** There is no record of which cooling tower units exist at a site, their service history, or which job serviced which asset. This makes warranty tracking and repeat-service quoting difficult.

**What Phase 3d would build:**

- `Asset` model: serial number, type (cooling tower model), location on site, linked to Customer
- Assets linked to jobs at time of job creation (many-to-many via `JobAsset`)
- Asset detail page: full service history (all jobs that touched this asset)
- Technicians can view asset details on their phone during a job

**Data model considerations:**

```
assets
- id
- customerId
- serialNumber
- assetType (e.g. "BAC VT1-40", free text)
- location (free text, e.g. "Roof level 3, north")
- notes
- createdAt

job_assets
- jobId
- assetId
- createdAt
```

Requires Phase 2e (`Customer`) to be complete first.

---

## Module 3e — Purchase Orders / Supplier Invoices

> **Combine with Module 3b.** This is the same problem as Material Tracking (3b), described from the admin/purchasing side rather than the technician side — see "Recommended Build Sequence" above (batch c). Scope as one module.

**The problem:** Materials and subcontractor costs are not tracked. Technicians purchase parts on-site and receipts arrive weeks later. Job costing is unreliable.

**What Phase 3e would build:**

- Admin creates purchase orders linked to a job (supplier, description, estimated cost)
- Supplier invoice upload (receipt photo → Vercel Blob)
- Reconciliation: match supplier invoice against purchase order
- Material costs feed into job cost totals
- Simple job P&L view: revenue (invoice total) vs costs (labour hours × rate + purchase orders)

**Data model considerations:**

```
purchase_orders
- id
- jobId
- supplierId (or supplier name as string for simplicity)
- description
- estimatedCost
- actualCost (nullable, set when invoice received)
- receiptUrl (nullable, Vercel Blob)
- status: "pending" | "received" | "reconciled"
- createdAt
```

Builds on the Vercel Blob upload pattern from Phase 1c.

---

## Module 3f — Quote Generation

**The problem:** The `/quotes` page (Phase 2b) lets sales engineers look up historical job performance to inform price estimates, but there is no way to actually produce a quote. Engineers currently calculate prices manually and send them via email.

**What Phase 3d would build:**

- An **hourly rate** per job type (or a default business rate) — set by the director in Settings
- A **quote creation flow**: pick a job type, enter estimated hours and any additional line items (materials, callout fee), system calculates a total
- A **Quote model** in the DB: linked to a customer, includes line items, status (`draft` | `sent` | `accepted` | `declined`)
- A **quote PDF** generated server-side (logo + ABN from `BusinessProfile`, line items, total, validity period)
- A **send flow**: mark as sent (records timestamp); optionally email the PDF
- The `/quotes` historical search page gains a "Create quote from this job type" shortcut — pre-fills estimated hours from the historical average

**Data model considerations:**

```
Quote
- id
- createdById (sales_engineer or director)
- customerName
- siteName
- jobType
- lineItems Json  -- [{ description, qty, unitPrice }]
- totalAmount Decimal(12,2)
- status: "draft" | "sent" | "accepted" | "declined"
- validUntil DateTime?
- pdfUrl String?  -- Vercel Blob
- createdAt
- updatedAt

RateCard  (optional — or just a single default rate on BusinessProfile)
- id
- jobType String
- hourlyRate Decimal(12,2)
- effectiveFrom DateTime
```

**Dependencies:** Builds on `BusinessProfile` (name, ABN, logo), `jobType` from Phase 2b, and the PDF generation pattern from Phase 2a compliance documents.

---

## Module 3g — AI Validation Coworker

> **Ship together with:** two sub-items from Module 3j below — predictive compliance reminders and statistical anomaly detection. Same hybrid philosophy, same batch — see "Recommended Build Sequence" above (batch g).

**The problem:** Data entry errors (missing fields, duplicate site/customer records, implausible readings) aren't caught until someone downstream notices — sometimes not until a customer complaint or a compliance audit.

**What Phase 3g would build:**

- Rule-layer validation consolidated from the current ad hoc checks scattered across `NewJobForm`, `CustomerForm`, and `VariationForm` into shared Zod modules, following the existing `src/lib/variations/validate.ts` precedent (currently the only standalone, reusable validation module in the app)
- A near-duplicate detector for site + customer + address combinations across jobs
- An AI layer — Claude Haiku 4.5 for fast field-level checks (debounced, on blur), Claude Sonnet 5 for a full-form "review before you submit" pass — that flags implausible values (e.g. an out-of-range reading) and explains *why*, via a new `/api/ai/validate` route
- Structured output only (`{ field, severity, message, suggestion }[]`, via `output_config.format`) — never free text the UI has to parse
- Rules run first and are free; AI is only called for what rules can't cover

**Data model considerations:**

```
AiAuditLog
- id
- userId
- feature: "validation" | "voice_note" | "company_assistant"
- toolCalls Json?
- promptTokens Int
- outputTokens Int
- costUsd Decimal
- createdAt
```

This table is shared across every AI module (3g–3j) — create it once here, reuse everywhere else.

**Dependencies:** None to start — deterministic checks and Haiku-based flags work against the schema as it exists today. True "duplicate cooling tower" detection (as opposed to duplicate job/site) is meaningfully stronger once Module 3d (Asset Tracking) lands, since there's currently no dedicated Tower/Asset entity to de-duplicate against — treat that as a quality improvement to layer in later, not a blocker.

---

## Module 3h — Voice Notes

> **Ship together with:** two sub-items from Module 3j below — photo-based defect triage and auto-drafted variation/quote text — both already depend on this module existing. See "Recommended Build Sequence" above (batch h).

**The problem:** Technicians record findings by memory or scribbled notes on-site; nothing is captured hands-free, in the moment, in the field.

**What Phase 3h would build:**

- Mobile audio capture (`MediaRecorder`) on the job screen, uploaded to Vercel Blob following the existing private-access convention already used for variation photos (`src/app/api/upload/photo/route.ts`)
- Async transcription via AssemblyAI (cheapest of the major providers at this volume, with diarization and PII redaction included)
- Claude Haiku 4.5 summary + action-item extraction attached to the job
- Offline queueing (record locally, upload on reconnect) as a scoped fast-follow, not a v1 blocker — requires a PWA manifest + service worker, which the app does not currently have. Ship online-first capture and prove it in the field before committing to the offline build.

**Data model considerations:**

```
VoiceNote
- id
- jobId
- technicianId
- audioBlobUrl
- durationSeconds
- transcript String?
- summary String?
- actionItems Json?
- status: "pending" | "transcribed" | "failed"
- createdAt
```

**Dependencies:** None. Independent of the other AI modules, though its transcripts become useful search input for Module 3i once that exists.

---

## Module 3i — AI Company Assistant

> **Ship together with:** one sub-item from Module 3j below — semantic search for quoting, a direct extension of this module's pgvector infrastructure. See "Recommended Build Sequence" above (batch i).

**The problem:** "Show me towers due next month," "find missing SWMS," "which technicians worked at Site X" all require someone to manually query the app or remember the answer. There's no single place to ask.

**What Phase 3i would build:**

- A chat panel backed by Claude Sonnet 5 using tool/function calling against typed, permission-scoped server functions that wrap existing Prisma queries — **never free-form SQL generation**
- Every tool enforces the same `requireRole()` guard already used across every API route today
- A narrower semantic-search tool (pgvector) reserved for free-text queries only — "find inspection notes mentioning corrosion" — not for the structured queries above, which are plain database lookups
- Draft-only output for anything generative ("create a draft report," "generate a service summary") — a human approves before it becomes a real record, reusing the existing `generateInvoicePdf.ts` / `generatePdf.ts` rendering pattern rather than inventing new PDF rendering
- Full audit logging of every tool call, via the shared `AiAuditLog` table introduced in Module 3g

**Data model considerations:**

```
ChatSession
- id
- userId
- title String?
- createdAt

ChatMessage
- id
- sessionId
- role: "user" | "assistant"
- content Text
- toolCalls Json?
- createdAt

DocumentChunk
- id
- sourceType: "ComplianceDoc" | "JobNote" | "VoiceNote" | "Quote"
- sourceId
- chunkText
- embedding Unsupported("vector(1024)")  -- pgvector, needs a raw-SQL migration (same escape hatch already used for the invoice_v2 drift correction)
- createdAt
```

**Dependencies:** `pgvector` extension enabled on Neon (included at no extra cost on the plan already in use). An embeddings vendor account — Voyage AI recommended, since Claude has no embeddings endpoint of its own. Benefits from Module 3h (voice transcripts become searchable) and Module 3d (Asset Tracking gives "towers" a real entity to query against, rather than inferring one from `Job.siteName`) — neither is a hard blocker, both improve answer quality.

---

## Module 3j — Intelligent Automation (bundle)

> **Redistributed, not built as one batch.** Per "Recommended Build Sequence" above, the five sub-items below ship alongside the modules they actually depend on (3g, 3h, 3i) rather than as a trailing bundle of their own — this section stays as the detailed reference for each sub-item's problem and dependency.

**The problem:** Several smaller, high-value automations don't warrant their own module but are worth scoping now so they aren't lost.

**What Phase 3j would build** (each independently shippable):

- **Predictive compliance reminders** — mostly a scheduled query against inspection due-dates; Claude only drafts the summary email to service managers. Rule-based at its core, not AI-based.
- **Photo-based defect triage** — Claude's native vision flags visible issues (corrosion, biological growth, damaged fill media) on inspection photos as a suggestion for the technician to confirm, never an automatic finding.
- **Auto-drafted variation/quote text** — turns a voice note (Module 3h) or a rough note into professional variation/quote copy for a sales engineer to approve.
- **Statistical anomaly detection on readings** — a rolling mean/standard-deviation check against a tower's own history, not an LLM call; AI's role is limited to explaining a flagged reading in plain language once it's found. Same hybrid philosophy as Module 3g.
- **Semantic search for quoting** — rides on Module 3i's pgvector infrastructure; lets sales engineers find "similar past jobs" by description rather than exact keyword.
- *Explicitly out of scope for AI:* smart scheduling/technician assignment. That's a constraint-optimization problem better solved with a scoring algorithm than a language model — only the plain-language explanation of a suggested assignment should ever touch an LLM.

**Dependencies:** Predictive reminders and anomaly detection have none. Photo triage and auto-drafted text depend on Module 3h. Semantic search for quoting depends on Module 3i.

---

## Module 3k — Maintenance Contracts

**The problem:** All work today is created job-by-job. Recurring service relationships (quarterly inspections, ongoing maintenance agreements) have no representation — nothing tracks contract value or renewal dates, and nothing generates the next visit automatically. Recurring revenue is invisible until someone remembers to create the next job.

**What Phase 3k would build:**

- A `Contract` model: customer, value, billing cadence, service interval, start/renewal dates
- A scheduled process that generates the next `Job` automatically from each active contract's interval, pre-filled from the contract's site/scope
- A renewal-approaching alert, reusing the same reminder pattern as Module 3g's predictive compliance reminders
- A contract list/detail view: value, status, linked jobs, next scheduled visit

**Data model considerations:**

```
Contract
- id
- customerId
- siteName
- value Decimal(12,2)
- billingCadence: "monthly" | "quarterly" | "annually"
- serviceIntervalDays Int
- startDate DateTime
- renewalDate DateTime
- status: "active" | "lapsed" | "cancelled"
- createdAt

-- Job gains an optional contractId FK once this module ships
```

**Dependencies:** None to start — works against `Customer` and `Job` as they exist today. Meaningfully better once Module 3d (Asset Tracking) exists (a contract can reference specific assets, not just a site) and once Module 3f (Quote Generation) exists (a contract can originate from an accepted quote rather than being created from scratch) — neither is a hard blocker.

---

## Module 3l — Customer Portal

**The problem:** Customers have no visibility into their own service history, upcoming visits, or documents — every question ("when's our next inspection," "can you resend that compliance certificate") becomes a phone call or email to the office.

**What Phase 3l would build:**

- A magic-link, no-password view scoped to one customer: job history, upcoming scheduled visits (richer once Module 3k exists), downloadable compliance certificates and invoices
- A "send portal link" action from the customer detail page (admin, director, sales_engineer)
- Read-only by design — the portal never lets a customer edit company data, only view and download

**Data model considerations:**

```
CustomerPortalToken
- id
- customerId
- token String @unique
- expiresAt DateTime
- createdAt
```

**Dependencies:** None to start — reuses `Customer`, `Job`, `Invoice`, and `ComplianceDocument` as they exist today. Genuinely new infrastructure regardless: this is the app's first public-facing, non-Clerk auth surface, so token issuance/expiry/revocation needs its own careful design pass before implementation — don't treat it as a quick bolt-on just because the underlying data already exists.

---

## General-Purpose Alternatives — considered, not selected

Two other trade-agnostic replacements for the retired Module 3c were proposed alongside Modules 3k and 3l above, but not picked for now. Kept here rather than deleted, since neither is hard to revisit:

- **Payroll / timesheet export.** Turns already-tracked `TimeEntry` records into an export (CSV, or a common payroll system's format) for pay runs. The underlying data already exists from Phase 1 — this would close a loop rather than open new scope, and is about as trade-agnostic as a feature gets. Probably the cheapest of the four original candidates if priorities shift.
- **Technician certification & licensing tracker.** Tracks staff certifications/licenses (working at heights, confined space, forklift, trade license, first aid) with expiry alerts, reusing the reminder pattern already established for compliance docs and Module 3g's predictive compliance reminders. General across any regulated trade with staff-side compliance, not just customer/asset-side.

*(Module 3d, Asset Tracking, needed no changes for generality — its fields are already free text, `assetType` and `location` are illustrative rather than structural, and "cooling tower" only appears in the module's prose description, not its data model.)*

---

## AI Modules — Free Prototyping Path

Every vendor needed for Modules 3g–3j has a free tier or trial credit large enough to build and demo the whole set without spending anything, before committing to production usage:

| Vendor | Free offer (as of 2026-07) | Covers |
|---|---|---|
| Neon (Postgres + pgvector) | Standing free tier — 100 CU-hrs/project/month, 0.5GB storage. Not a trial. | The database layer indefinitely at this scale |
| Anthropic (Claude API) | $5 one-time trial credit, no card required | Hundreds–low thousands of test calls (a validation check costs a fraction of a cent; an assistant query ~$0.02–0.03) |
| AssemblyAI | $50 one-time credit, no card required | ~185 hours of transcription — far more than a voice-notes demo needs |
| Voyage AI (embeddings) | First 200M tokens free. Not a trial. | Embedding the entire existing document/notes corpus, indefinitely, at this business's scale |
| Vercel Blob | 1GB storage + 10GB transfer/month on the Hobby plan already in use | A handful of test audio files and photos |

**Caveat:** the Anthropic and AssemblyAI allowances are one-time trial credits, not recurring — they cover building and demoing, not indefinite production traffic. Neon and Voyage's free tiers are standing, not trials, and could realistically stay free even into light production. See §"Cost estimates by usage tier" in the Phase 3 AI research artifact for expected steady-state spend once a module is live (single digits to low tens of dollars/month at pilot scale, per module).

**Recommended first build:** Module 3g (AI Validation Coworker) alone — it needs zero new vendor accounts beyond one Anthropic API key, has no offline/mobile complexity, and a full working demo would burn a few cents of the $5 trial credit. Use it as the proof that the AI-route pattern, `AiAuditLog`, and env-var convention work end-to-end before starting 3h–3j.

---

## Architecture Notes for Future-Proofing

These decisions should be maintained in Phases 1–2 to avoid rework in Phase 3:

1. **Keep `UserRole` enum open.** New roles (`draftsman` is already in the enum) should be addable without changing the RBAC middleware — `requireRole()` accepts an array.

2. **Vercel Blob Storage pattern is reusable.** The upload pattern from Phase 1c (`/api/upload/photo`) should be generalised to `/api/upload` with a `type` parameter so that drawings, receipts, and compliance docs all use the same endpoint.

3. **`jobs` table is the central entity.** Every Phase 3 module hangs off `jobId`. Do not denormalise job data into related tables — always join back.

4. **Push notification infrastructure is reusable.** The `PushSubscription` table and `sendPushToUser()` helper from Phase 1c should be used for any future notifications (drawing ready, material reconciled, etc.).

5. **Avoid over-indexing the DB now for Phase 3 queries.** Add indexes when the queries are known at implementation time. Premature indexes waste write performance.

6. **AI modules never generate SQL.** Every AI feature that touches company data (3g, 3i, 3j) reaches the database only through named, typed functions that reuse `requireRole()` — the model chooses which function to call, never what query to run.

7. **`AiAuditLog` is created once, in Module 3g, and reused by every later AI module.** Don't let 3h or 3i invent a parallel logging table.

8. **Anything an AI module generates that could become an official record (a report, a compliance-doc field, an invoice line) ships as a draft requiring human approval.** No AI module in this phase auto-submits.

---

## Phase 3 — Recommended Evaluation Criteria

Phase 3 should only be started if:

- Phase 2 has been live for at least 3 months
- Users are actively requesting one of the modules
- The business has confirmed it will not move to a different platform within 12 months
- The Phase 2 codebase has been reviewed for technical debt before adding Phase 3 complexity

**Additionally, before starting any AI module (3g–3j):** confirm the business owner is comfortable with Anthropic processing company/customer data in the US by default (see Module 3i) — a five-minute conversation, but a conscious one rather than a default. Everything else in the AI modules can be prototyped for free first (see "AI Modules — Free Prototyping Path") without needing this conversation, since a local demo doesn't touch real customer data.
