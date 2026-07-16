# Accurate Compliance Documents Implementation Plan

> Building directly this run (no subagent dispatch, per established fast-track preference) — this doc tracks the task breakdown, not a subagent-brief format.

**Goal:** Ship SWMS, JSA, WHS Management Plan, and Induction templates that match real WorkSafe QLD content requirements (SWMS/WHS Management Plan) or genuine best practice (JSA/Induction), via a locked-statutory-core + flexible-admin-extension architecture.

Full context: `docs/superpowers/specs/2026-07-17-accurate-compliance-documents-design.md`.

**Pre-existing bug fixed along the way**: `prisma/seed.ts` seeds `type: "SWMS"`/`type: "JSA"` (uppercase), but `src/app/api/compliance/templates/route.ts`'s Zod schema (`z.enum(["swms","jsa","whs"])`), `ComplianceForm.tsx`'s `TYPE_LABELS`/`TYPE_COLOURS`, and `TemplateBuilder.tsx`'s `DOC_TYPES` all use lowercase — the two existing seeded templates currently render with no color badge and a raw uppercase fallback label. Standardizing on lowercase (the API/UI convention, 3 files deep vs. seed's 1 file) and fixing the seed data.

## Task 1: Type system — new field types + type-casing fix

- `src/lib/compliance/types.ts`: add `"table" | "signature-list"` to `FieldType`; add `TableColumn` interface; add `columns?: TableColumn[]` to `TemplateField`; extend `DocumentValues`'s value union with `TableRowValue[]` and `SignatureListEntry[]`.
- `prisma/seed.ts`: change `type: "SWMS"` → `type: "swms"`, `type: "JSA"` → `type: "jsa"` at the two existing template upserts (lines ~499, ~529 per last read — re-check exact lines at edit time, file may have shifted).
- Verify: `npx tsc --noEmit` clean, `npx vitest run` still green (this step touches no runtime logic yet).
- Commit.

## Task 2: Statutory sections module

- New `src/lib/compliance/statutorySections.ts`: `SWMS_STATUTORY_SECTIONS`, `WHS_MANAGEMENT_PLAN_STATUTORY_SECTIONS` (full field lists per spec Part 2), `getStatutorySections(type: string): TemplateSections | null`, and a `RESERVED_FIELD_PREFIX = "statutory_"` export used by both the statutory field IDs themselves and the collision-guard check.
- New `src/lib/compliance/__tests__/statutorySections.test.ts`: `getStatutorySections("swms")`/`"whs_management_plan"` return non-empty section arrays with every field ID prefixed `statutory_`; `getStatutorySections("jsa")`/`"induction"`/anything else returns `null`.
- Commit.

## Task 3: Form renderer — table + signature-list field types

- `src/app/compliance/new/ComplianceForm.tsx`: add render branches for `field.type === "table"` (add/remove row UI, one input per column per row) and `field.type === "signature-list"` (add/remove entry UI, each entry a name input + `SignatureCanvas`). Reuse existing `SignatureCanvas` component unmodified — one instance per signature-list entry.
- Confirm existing required-field validation (`Array.isArray(val) && val.length === 0`) already covers both new types correctly (array-shaped values) — no change needed there, verify by reading the current `submit()` logic once more before assuming.
- Update `ComplianceForm.tsx`'s section-computation to merge statutory + template sections: `const allSections = [...(getStatutorySections(template.type) ?? []), ...templateSections]`.
- Manual verification (dev server): open a SWMS document form, confirm the statutory section renders, add table rows, add signature-list entries, submit.
- Commit.

## Task 4: PDF renderer — table + signature-list field types

- `src/lib/compliance/generatePdf.ts`: extend `FieldValue` component with `table` (render column headers + one row per entry, bordered grid using `@react-pdf/renderer`'s `View`/`Text`) and `signature-list` (render each entry as name + signature image, stacked) cases. Merge statutory + template sections the same way as the form (shared helper, not duplicated logic — consider extracting the merge into `statutorySections.ts` itself, e.g. `mergeSections(type, customSections)`, used by both `ComplianceForm.tsx` and `generatePdf.ts`).
- Add the disclaimer footer text (spec's exact copy) to SWMS/WHS Management Plan PDFs only — conditional on `template.type`.
- `src/lib/compliance/__tests__/pdf.test.ts`: new cases per spec's Testing section (table renders rows, signature-list renders one image per entry, statutory section precedes custom sections, disclaimer present on SWMS/WHS Management Plan only).
- Commit.

## Task 5: TemplateBuilder — new field types + statutory read-only preview + reserved-ID guard

- `src/app/compliance/templates/TemplateBuilder.tsx`: add `table`/`signature-list` to `FIELD_TYPES`; add a column-editor UI for `table` fields (mirrors the existing `updateChecklistOptions` pattern — one line per column label, parsed into `TableColumn[]`); update `DOC_TYPES` to the 4 lowercase values (`swms`, `jsa`, `whs_management_plan`, `induction`); when `type` is `swms`/`whs_management_plan`, render `getStatutorySections(type)` as a read-only preview block above the editable sections, clearly labeled "Required by law — cannot be edited here."
- Client-side reserved-ID check in `handleSave()`: reject (set `error`, don't submit) if any custom field ID starts with `statutory_`.
- Server-side reserved-ID check (the actual guarantee) in `src/app/api/compliance/templates/route.ts` and `[id]/route.ts`: reject with 400 if any field ID in the submitted `sections` starts with `statutory_`. Also update both routes' `z.enum([...])` to the 4 lowercase values.
- Update `src/app/api/compliance/__tests__/templates.test.ts` (existing) for the new enum values and the new collision-guard rejection case.
- Manual verification: open the SWMS template in the builder, confirm the statutory preview shows, confirm adding a custom section still works, confirm trying to save a field ID starting with `statutory_` is rejected.
- Commit.

## Task 6: Seed data — JSA, Induction, SWMS, WHS Management Plan

- `prisma/seed.ts`: replace the existing JSA/SWMS template `sections` content with the spec's designed defaults (JSA: full 4-section best-practice template with the risk-assessment table and PPE checklist and signature-list sign-off; SWMS: minimal/empty custom `sections` since its statutory core is code-injected — likely just an empty array or one optional "Additional Notes" custom section). Add two new seed template upserts: Induction (full best-practice content) and WHS Management Plan (minimal custom sections, statutory core code-injected).
- Update the seed script's console.log summary line to mention all 4 types.
- Run `pnpm exec tsx prisma/seed.ts` against the live Neon DB (per this project's established single-shared-DB convention) — **needs explicit go-ahead first**, matching this session's established pattern for live-DB writes.
- Commit.

## Task 7: Final verification

- `npx vitest run && npx tsc --noEmit` — full suite green.
- Manual dev-server pass: create one document of each of the 4 types end-to-end (pick job → pick template → fill form including new field types → submit → confirm PDF generates and looks right, including the disclaimer on SWMS/WHS Management Plan and its absence on JSA/Induction).
- Confirm the Templates admin page (`src/app/compliance/templates/page.tsx`) carries the same disclaimer language for SWMS/WHS Management Plan templates (per spec's Global Constraints — "must carry the same caveat prominently").
