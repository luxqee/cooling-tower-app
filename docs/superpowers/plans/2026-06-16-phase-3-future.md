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

## Module 3c — Draftsman Module

**The problem:** Engineering drawings are requested from draftsmen verbally or via email. There is no formal request process, no tracking of which job requires which drawings, and no version control.

**What Phase 3c would build:**

- A drawing request form (submitted by service manager or director)
- Request queue visible to draftsmen
- File upload for completed drawings (Vercel Blob)
- Status tracking: requested → in progress → complete → approved
- Drawing versions tracked (each upload creates a new version, previous versions retained)

**Data model considerations (plan for in earlier phases):**

```
drawing_requests
- id
- jobId
- requestedById
- title
- description
- status: "requested" | "in_progress" | "complete" | "approved"
- createdAt

drawing_files
- id
- requestId
- uploadedById
- fileUrl (Vercel Blob)
- version: integer
- createdAt
```

The `draftsman` role already exists in the `UserRole` enum. No schema changes needed to support this.

---

## Architecture Notes for Future-Proofing

These decisions should be maintained in Phases 1–2 to avoid rework in Phase 3:

1. **Keep `UserRole` enum open.** New roles (`draftsman` is already in the enum) should be addable without changing the RBAC middleware — `requireRole()` accepts an array.

2. **Vercel Blob Storage pattern is reusable.** The upload pattern from Phase 1c (`/api/upload/photo`) should be generalised to `/api/upload` with a `type` parameter so that drawings, receipts, and compliance docs all use the same endpoint.

3. **`jobs` table is the central entity.** Every Phase 3 module hangs off `jobId`. Do not denormalise job data into related tables — always join back.

4. **Push notification infrastructure is reusable.** The `PushSubscription` table and `sendPushToUser()` helper from Phase 1c should be used for any future notifications (drawing ready, material reconciled, etc.).

5. **Avoid over-indexing the DB now for Phase 3 queries.** Add indexes when the queries are known at implementation time. Premature indexes waste write performance.

---

## Phase 3 — Recommended Evaluation Criteria

Phase 3 should only be started if:

- Phase 2 has been live for at least 3 months
- Users are actively requesting one of the three modules
- The business has confirmed it will not move to a different platform within 12 months
- The Phase 2 codebase has been reviewed for technical debt before adding Phase 3 complexity
