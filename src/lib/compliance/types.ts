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

export interface TemplateSection {
  id: string;
  title: string;
  fields: TemplateField[];
}

export type TemplateSections = TemplateSection[];

// columnId -> cell text, one row of a "table" field
export type TableRowValue = Record<string, string>;
// one entry of a "signature-list" field — signature is a base64 data URL,
// same format the existing single "signature" field already produces
export interface SignatureListEntry {
  name: string;
  signature: string;
}

// fieldId → string | boolean | string[] (checklist) | TableRowValue[] (table)
// | SignatureListEntry[] (signature-list) | null
export type DocumentValues = Record<string, string | boolean | string[] | TableRowValue[] | SignatureListEntry[] | null>;
