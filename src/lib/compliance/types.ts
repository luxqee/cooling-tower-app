export type FieldType = "text" | "textarea" | "date" | "checkbox" | "checklist" | "signature";

export interface TemplateField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[]; // only used when type === "checklist"
}

export interface TemplateSection {
  id: string;
  title: string;
  fields: TemplateField[];
}

export type TemplateSections = TemplateSection[];

// fieldId → string | boolean | string[] (for checklist) | null
export type DocumentValues = Record<string, string | boolean | string[] | null>;
