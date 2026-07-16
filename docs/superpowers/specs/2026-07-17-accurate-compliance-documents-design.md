# Accurate Compliance Documents (SWMS, JSA, WHS Management Plan, Induction) Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this spec into a task-by-task implementation plan, then superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to build it.

**Goal:** Replace the app's current placeholder compliance templates (a handful of checkboxes) with four document types that genuinely match what a real Australian trade business needs: SWMS and WHS Management Plan built to satisfy the actual content requirements of the Work Health and Safety Regulation 2011 (Qld), and JSA and Induction built to match common, recognizable industry best practice.

**Architecture:** A hybrid model. SWMS and WHS Management Plan each get a **fixed, code-defined statutory section** — the legally-mandated content, never editable via the admin template builder — that renders automatically ahead of whatever custom sections an admin adds using the existing generic `TemplateBuilder`. JSA and Induction stay fully generic/admin-editable, shipped with accurate best-practice default content instead of placeholder checkboxes. Two new field types (`table` for repeating hazard/risk/control rows, `signature-list` for a dynamic list of worker signatures) extend the existing generic field-rendering pipeline (`ComplianceForm.tsx`, `generatePdf.ts`) rather than creating separate one-off rendering paths per document type.

**Tech Stack:** Next.js 14, Prisma 7, `@react-pdf/renderer` (already used for compliance PDFs), TypeScript, Vitest.

## Global Constraints

- **Not a substitute for professional WHS advice.** This spec is built from published regulator guidance and the cited regulation sections, researched by an AI assistant, not reviewed by a WHS lawyer or consultant. Every SWMS and WHS Management Plan PDF the app generates must carry a visible footer note saying so (exact wording in the SWMS/WHS Management Plan sections below), and the Templates admin page must carry the same caveat prominently. This is non-negotiable — ship the disclaimer in the same commit as the templates, not as a follow-up.
- **Source transparency**: worksafe.qld.gov.au blocked direct fetching during research (403). The SWMS structure is grounded in an official regulator-published template from WorkSafe ACT (built on the same model WHS Regulation Queensland adopted) plus WHS Regulation 2011 (Qld) s299 content requirements, cited via a WHS compliance consultancy's article referencing specific subsections (299(2a), 299(2d), 299(3a)(i-ii), 299(3b)) — not the raw legislative text directly, which could not be fetched. The WHS Management Plan structure is grounded in a WorkSafe QLD guidance-page summary (also could not fetch the source page directly, relied on search-result synthesis). This should be re-verified against the primary legislation (`legislation.qld.gov.au`, `sl-2011-0240`) by a human before relying on it as genuinely compliant — flag this plainly in the PR/commit, not just this doc.
- No Prisma schema migration for `ComplianceTemplate.type` — it stays a free-text `String` (not converted to an enum) so future custom document types remain possible; "locked" behavior is enforced in application code (`if (type === "SWMS")`), not the database.
- No Prisma schema migration for `ComplianceDocument.values` either — it's already `Json` and can hold the new `table`/`signature-list` value shapes without a schema change.
- Field IDs used by statutory (locked) sections are reserved — the admin `TemplateBuilder` must reject any custom field ID that collides with a reserved statutory ID for that document type, both client-side (immediate feedback) and server-side (the actual guarantee, since client-side checks are bypassable).

---

## Part 1: New Field Types

Extend `src/lib/compliance/types.ts`'s `FieldType` union with two additions:

```ts
export type FieldType = "text" | "textarea" | "date" | "checkbox" | "checklist" | "signature" | "table" | "signature-list";

export interface TableColumn {
  id: string;
  label: string;
}

export interface TemplateField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];      // only used when type === "checklist"
  columns?: TableColumn[]; // only used when type === "table"
}

export type TableRowValue = Record<string, string>;              // columnId -> cell text
export type SignatureListEntry = { name: string; signature: string }; // signature = base64 data URL, same format the existing single "signature" field already uses
export type DocumentFieldValue = string | boolean | string[] | TableRowValue[] | SignatureListEntry[] | null;
export type DocumentValues = Record<string, DocumentFieldValue>;
```

- **`table`**: a field whose value is an array of rows, each row a map of column ID to cell text. Used for SWMS/JSA's task-hazard-control grid and WHS Management Plan's responsible-persons list. Rendered as an add/remove-row input in the fill-out form, and as an actual bordered table in the PDF.
- **`signature-list`**: a field whose value is an array of `{ name, signature }` entries. Used for SWMS/WHS Management Plan/JSA/Induction sign-off sections where more than one person needs to sign (workers on a task, attendees at a group induction). Rendered as an add/remove-entry list, each entry reusing the existing `SignatureCanvas` component for capture.

This is additive to the existing field-rendering pipeline (`ComplianceForm.tsx`'s per-type render branches, `generatePdf.ts`'s `FieldValue` component) — every existing field type (`text`, `checkbox`, etc.) is untouched.

---

## Part 2: Statutory Sections (locked, code-defined)

New file `src/lib/compliance/statutorySections.ts` exporting the fixed content for SWMS and WHS Management Plan, plus a lookup function:

```ts
export function getStatutorySections(templateType: string): TemplateSections | null {
  if (templateType === "SWMS") return SWMS_STATUTORY_SECTIONS;
  if (templateType === "WHS_MANAGEMENT_PLAN") return WHS_MANAGEMENT_PLAN_STATUTORY_SECTIONS;
  return null; // JSA, INDUCTION, and any future custom type: fully admin-editable, no locked core
}
```

Every place that currently reads `template.sections` directly (the fill-out form, the PDF generator) instead computes `const allSections = [...(getStatutorySections(template.type) ?? []), ...template.sections]` — statutory content always renders first, admin's custom sections follow. `TemplateBuilder.tsx` (the admin editor) only ever reads/writes `template.sections` — it displays the statutory sections read-only (clearly labeled, e.g. "Required by law — cannot be edited here") so an admin can see what's included without being able to break it.

**Collision guard, concretely**: every field ID inside `SWMS_STATUTORY_SECTIONS`/`WHS_MANAGEMENT_PLAN_STATUTORY_SECTIONS` is prefixed `statutory_` (e.g. `statutory_pcbu_name`, `statutory_hrcw_falling`, `statutory_task_table`) — a fixed naming convention, not a maintained list. The template create/update route (`src/app/api/compliance/templates/route.ts` and its `[id]` variant) rejects any request where a custom field ID in `template.sections` starts with `statutory_`, regardless of `template.type` — cheap to check, no per-type list to keep in sync as statutory content evolves. `TemplateBuilder.tsx` mirrors the same check client-side for immediate feedback, but the server check is the actual guarantee.

### SWMS statutory content

Field-by-field, grouped into sections (exact labels are illustrative — the plan will pin exact copy):

**Section: Details**
- PCBU name & contact (text)
- Principal Contractor name & contact (text, not required — many jobs have no head contractor above this business)
- Works Manager name & phone (text)
- Work activity description (textarea)
- Workplace location (text)
- Date SWMS provided to Principal Contractor (date, not required)

**Section: High Risk Construction Work** — one checkbox per legislated category, all 18, unabridged:
Risk of a person falling more than 2 metres · Work on a telecommunication tower · Demolition of an load-bearing structure · Likely to involve disturbing asbestos · Temporary load-bearing support for structural alterations or repairs · Work in or near a confined space · Work in or near a shaft or trench deeper than 1.5m or a tunnel · Use of explosives · Work on or near pressurised gas mains or piping · Work on or near chemical, fuel or refrigerant lines · Work on or near energised electrical installations or services · Work in an area that may have a contaminated or flammable atmosphere · Tilt-up or precast concrete elements · Work on, in or adjacent to a road, railway, shipping lane or other traffic corridor · Work in an area with movement of powered mobile plant · Work in areas with artificial extremes of temperature · Work in or near water or other liquid that involves a risk of drowning · Diving work.

**Section: Risk Assessment** — one `table` field, columns: Task (sequence step) | Hazards & Risks | Control Measures.

**Section: Compliance & Review** (satisfies WHS Reg s299(2d) — implementation/monitoring/review):
- Person responsible for ensuring compliance with this SWMS (text)
- What measures are in place to ensure compliance (textarea)
- Person responsible for reviewing SWMS control measures (text)
- How control measures will be reviewed (textarea)
- Review date (date)

**Section: Sign-off**
- Workers (`signature-list`)
- Date SWMS received by workers (date)
- Reviewer name & signature (`signature`, single — not a list)

### WHS Management Plan statutory content

**Section: Project Details**
- Client name (text)
- Principal Contractor name (text)
- Major subcontractors (textarea — free text list, project subcontractor sets vary too much to templatize into a fixed table)
- Project location(s) (text)
- Anticipated start date (date)
- Anticipated duration (text)
- Scope of works (textarea)

**Section: Responsible Persons** — one `table` field, columns: Name | Position | WHS Responsibility.

**Section: Consultation, Cooperation & Coordination** — free text (textarea) describing arrangements between PCBUs at the workplace.

**Section: Incident Management** — free text (textarea) describing arrangements for managing WHS incidents.

**Section: Site-Specific Rules** — free text (textarea): the rules themselves and how workers are informed of them.

**Section: Sign-off**
- Principal Contractor name & signature (`signature`, single — the regulation specifically requires PC sign-off, not a worker list)
- Review/revision provisions (textarea)

### Disclaimer text (exact copy, used in both PDF footer and Templates admin page)

> "This [SWMS / WHS Management Plan] was generated using a template based on published WorkSafe Queensland guidance and the Work Health and Safety Regulation 2011 (Qld). It has not been reviewed by a qualified WHS professional. [Business name] is responsible for verifying this document meets its current legal obligations before relying on it."

---

## Part 3: JSA default template (fully admin-editable, no lock)

Replaces the current 4-checkbox seed template with:

**Section: Job Details** — task description (textarea), location (text), date (date), prepared by (text).

**Section: Risk Assessment** — one `table` field, columns: Task Step | Hazard | Risk Rating | Control Measure.

**Section: PPE Required** — one `checklist` field: hard hat, safety glasses, gloves, hi-vis clothing, steel-cap boots, hearing protection, respiratory protection, fall-arrest harness.

**Section: Sign-off** — workers involved (`signature-list`), supervisor name & signature (`signature`).

Nothing here is locked — this is a better default, admins can still add/remove/edit anything via the existing `TemplateBuilder`, same as today.

## Part 4: Induction default template (fully admin-editable, no lock)

**Section: Site Details** — site/location (text), date (date), person conducting induction (text).

**Section: Topics Covered** — one `checklist` field: site-specific hazards, emergency procedures & muster point, emergency contact numbers, PPE requirements, amenities/facilities location, permit-to-work requirements, hazard/incident reporting procedure.

**Section: Worker Acknowledgment** — attendees (`signature-list` — group inductions with multiple workers signing in one session are the common case), date acknowledged (date).

---

## Testing

- `src/lib/compliance/__tests__/pdf.test.ts` (existing) gets new cases: rendering a `table` field with 2+ rows produces the expected table structure; rendering a `signature-list` field with 2+ entries produces one image per entry; a document with no statutory section (JSA/Induction) renders only the admin-defined sections; a document with a statutory section (SWMS/WHS Management Plan) renders the statutory section before the admin's custom sections; the disclaimer footer text appears on SWMS/WHS Management Plan PDFs and does NOT appear on JSA/Induction PDFs.
- New test for `getStatutorySections()`: returns the right fixed content for `"SWMS"`/`"WHS_MANAGEMENT_PLAN"`, returns `null` for `"JSA"`/`"INDUCTION"`/anything else.
- New test for the reserved-field-ID guard in the template create/update route: rejects a custom field whose ID collides with a reserved statutory ID for that template's type; allows it for a type with no statutory section.
- `ComplianceForm.tsx`/`TemplateBuilder.tsx` are client components — no new unit tests per this repo's existing convention (pages/interactive components aren't unit tested); the new `table`/`signature-list` form inputs get manual verification (add/remove row, add/remove signature entry, submit, confirm the PDF reflects it) as a plan step.

## Rollout

Land as separate commits per part (field types → statutory sections + SWMS → WHS Management Plan → JSA → Induction) so each can be reviewed and reverted independently. Update `prisma/seed.ts`'s compliance template seed data to the new content as part of the SWMS/JSA/Induction/WHS Management Plan commits respectively, so the seeded demo data matches what ships. No feature flag — existing `ComplianceDocument` rows with the old simple field shapes remain valid (old field IDs just won't collide with anything new); this is purely additive.
