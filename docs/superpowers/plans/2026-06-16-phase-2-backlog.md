# Phase 2 — Backlog Scope Document

> **Status:** Not yet started. Trigger criteria must be met before Phase 2 begins. See `docs/phase-2-trigger-criteria.md` for the go/no-go checklist.

> **For agentic workers:** This is a scope document, not an implementation plan. When Phase 2 is approved, convert each module below into its own implementation plan using the `superpowers:writing-plans` skill before writing any code.

---

## Trigger Criteria (summary)

Phase 2 starts when Phase 1 has been live for at least 4 weeks and all of the following are true:

- Technicians are reliably clocking in/out on real jobs (>80% of shifts captured)
- At least 5 variations have been submitted, approved, and invoiced through the platform
- The service manager considers the scheduling in Excel a bottleneck worth solving
- Directors have signed off that Phase 1 delivered measurable value

---

## Module 2a — Compliance Document Templates

**The problem:** Technicians build SWMS (Safe Work Method Statements), JSAs (Job Safety Analyses), and WHS checklists from scratch for every job. It takes 30–60 minutes per document and errors are common.

**What Phase 2a builds:**

- A library of compliance document templates (SWMS, JSA, WHS) specific to cooling tower work
- Technicians select a template and fill in job-specific fields on their phone
- Documents are generated as PDFs and stored in Vercel Blob Storage
- PDFs are accessible by the admin and director for record-keeping
- Documents are linked to the relevant job record

**Key data requirements:**

- New `compliance_documents` table: `id`, `jobId`, `type` (swms|jsa|whs), `templateId`, `fields` (JSON), `pdfUrl`, `createdBy`, `createdAt`
- New `templates` table: `id`, `type`, `name`, `fields` (JSON schema of required inputs), `bodyTemplate` (markdown/HTML)
- PDF generation: `@react-pdf/renderer` or `puppeteer` (evaluate at implementation time)

**Roles:**

| Feature | Technician | Admin | Director |
|---------|:----------:|:-----:|:--------:|
| Fill in template | ✅ | ❌ | ❌ |
| View all docs | ❌ | ✅ | ✅ |
| View own docs | ✅ | — | — |
| Manage templates | ❌ | ✅ | ❌ |

**NFR constraints:**
- PDF generation must complete in under 10 seconds
- Documents stored for 7 years (Australian WHS compliance requirement)
- Files stored in Vercel Blob with `access: "private"` — never public URLs

---

## Module 2b — Quoting from Historical Job Data

**The problem:** Sales engineers quote new jobs by memory and judgment. Historical job data (actual hours, variations, materials used) is not accessible to them in any useful form.

**What Phase 2b builds:**

- A read-only quoting tool for sales engineers
- Search completed jobs by site type, customer, or job type
- View actual hours logged vs quoted hours for those jobs
- View approved variations to understand what extras are typically found
- Export a summary (CSV or PDF) to feed into a quote

**Key data requirements:**

- No new tables — reads from `jobs`, `time_entries`, `variations`, `invoices`
- New Prisma queries with aggregations: actual hours, variation totals, % overage rates by job type
- A `jobType` field needs to be added to `jobs` (new column via migration)

**Roles:**

| Feature | Sales Engineer | Director | Admin |
|---------|:--------------:|:--------:|:-----:|
| Search historical jobs | ✅ | ✅ | ✅ |
| View hours and variations | ✅ | ✅ | ✅ |
| Export summary | ✅ | ✅ | ✅ |

**NFR constraints:**
- Sales engineers must **not** see individual technician names (privacy)
- Queries across completed jobs must return in under 3 seconds — add appropriate DB indexes

---

## Module 2c — Full Scheduling View

**The problem:** Scheduling lives in an Excel spreadsheet managed by the service manager. There is no connection between the schedule and job records, so changes cause double-handling.

**What Phase 2c builds:**

- A calendar-style week view showing which technician is assigned to which job each day
- Drag-and-drop assignment (desktop only; mobile is read-only)
- Conflict detection: warns if a technician is assigned to two jobs on the same day
- Assignments created here sync to the `assignments` table (which Phase 1b already reads)
- Push notification to technician when they are assigned to a job

**Key data requirements:**

- Builds on existing `assignments` table — no schema changes expected
- `assignedDate` currently stores a single date; if multi-day jobs need tracking, a `dateRange` would be needed (evaluate at implementation time)

**Roles:**

| Feature | Service Manager | Director | Technician |
|---------|:---------------:|:--------:|:----------:|
| View schedule | ✅ | ✅ | Own only |
| Create/edit assignments | ✅ | ✅ | ❌ |
| Receive assignment notification | — | — | ✅ |

**NFR constraints:**
- Desktop drag-and-drop can use a library like `@dnd-kit/core`
- Mobile view must be read-only and load fast — avoid full-calendar libraries on mobile

---

## Module 2d — Admin Invoicing Flow

**The problem:** Invoice records are created automatically from approved variations (Phase 1c), but the admin currently has no way to view, adjust, or mark them as exported to Simpro.

**What Phase 2d builds:**

- Admin view of all invoice records by job
- Ability to set `baseAmount` (from Simpro quote) on each invoice
- Mark an invoice as "exported to Simpro" (a status flag, not actual Simpro integration)
- Download a CSV export of invoice line items for import into Simpro

**Key data requirements:**

- Add `exportedAt DateTime?` and `simpiroExportRef String?` to `invoices` table (migration required)
- No actual Simpro API integration in Phase 2 — CSV export only

**Roles:**

| Feature | Admin | Director |
|---------|:-----:|:--------:|
| View invoices | ✅ | ✅ |
| Set base amount | ✅ | ❌ |
| Mark exported | ✅ | ❌ |
| Download CSV | ✅ | ✅ |

---

## Phase 2 — Recommended Build Order

When Phase 2 is approved, implement in this order:

1. **2a** (Compliance Documents) — highest operational risk if left unaddressed; directly saves technician time
2. **2b** (Quoting) — high revenue impact; sales engineers already asking for this
3. **2d** (Admin Invoicing) — closes the loop on the variation capture built in Phase 1c
4. **2c** (Scheduling) — most complex; service manager may self-manage in Excel until Phase 2c is ready

Each module should get its own implementation plan document before work begins.
