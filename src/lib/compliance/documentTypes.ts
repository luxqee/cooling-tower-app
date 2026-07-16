// Single source of truth for compliance document type metadata — label,
// badge colour, and the admin-facing dropdown list. Previously duplicated
// independently across compliance/page.tsx, ComplianceForm.tsx, and
// TemplateBuilder.tsx, which is how they drifted out of sync with the seed
// data's type strings in the first place.
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  swms: "SWMS",
  jsa: "JSA",
  whs_management_plan: "WHS Management Plan",
  induction: "Induction",
};

export const DOCUMENT_TYPE_COLOURS: Record<string, string> = {
  swms: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  jsa: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  whs_management_plan: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  induction: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

export const DOCUMENT_TYPES = [
  { value: "swms", label: "SWMS" },
  { value: "jsa", label: "JSA" },
  { value: "whs_management_plan", label: "WHS Management Plan" },
  { value: "induction", label: "Induction" },
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number]["value"];
