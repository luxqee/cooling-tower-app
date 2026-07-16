import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import type { ComplianceDocument, ComplianceTemplate, Job, User } from "@prisma/client";
import type { TemplateField, TemplateSections, DocumentValues, TableRowValue, SignatureListEntry } from "./types";
import { mergeSections, hasStatutoryContent } from "./statutorySections";

const styles = StyleSheet.create({
  page:          { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  header:        { marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  headerRow:     { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  logoImage:     { width: 48, height: 48, marginRight: 10 },
  headerText:    { flex: 1 },
  typeBadge:     { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#ffffff", backgroundColor: "#f59e0b", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, marginBottom: 6, alignSelf: "flex-start", textTransform: "uppercase" },
  docTitle:      { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  headerMeta:    { fontSize: 9, color: "#64748b", marginTop: 2 },
  section:       { marginBottom: 16 },
  sectionTitle:  { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, paddingBottom: 3, borderBottomWidth: 0.5, borderBottomColor: "#cbd5e1" },
  fieldRow:      { flexDirection: "row", marginBottom: 5, minHeight: 16 },
  fieldLabel:    { width: "35%", fontFamily: "Helvetica-Bold", color: "#475569", paddingRight: 8 },
  fieldValue:    { width: "65%", color: "#1e293b" },
  signatureImage:{ width: 160, height: 60, marginTop: 2 },
  footer:        { position: "absolute", bottom: 20, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#94a3b8", borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 6 },
  disclaimer:    { position: "absolute", bottom: 34, left: 40, right: 40, textAlign: "center", fontSize: 7, color: "#94a3b8" },
  companyName:   { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1e293b", marginBottom: 6 },
  fullWidthField:{ marginBottom: 10 },
  fullWidthLabel:{ fontFamily: "Helvetica-Bold", color: "#475569", marginBottom: 4 },
  table:         { borderWidth: 0.5, borderColor: "#cbd5e1" },
  tableHeaderRow:{ flexDirection: "row", backgroundColor: "#f1f5f9", borderBottomWidth: 0.5, borderBottomColor: "#cbd5e1" },
  tableHeaderCell:{ flex: 1, padding: 4, fontFamily: "Helvetica-Bold", fontSize: 8, borderRightWidth: 0.5, borderRightColor: "#cbd5e1" },
  tableRow:      { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  tableCell:     { flex: 1, padding: 4, fontSize: 8, borderRightWidth: 0.5, borderRightColor: "#e2e8f0" },
  signatureListEntry: { marginBottom: 8 },
  signatureListName:  { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 2 },
});

const DISCLAIMER_TEXT =
  "This document was generated using a template based on published WorkSafe Queensland guidance and the Work Health and Safety Regulation 2011 (Qld). It has not been reviewed by a qualified WHS professional. Your business is responsible for verifying this document meets its current legal obligations before relying on it.";

export interface GeneratePdfArgs {
  document: ComplianceDocument;
  template: ComplianceTemplate;
  job: Job;
  createdBy: User;
  businessName?: string;
  logoUrl?: string | null;
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-AU"); } catch { return iso; }
}

export function FieldValue({ type, value }: { type: string; value: unknown }) {
  if (value == null || value === "") return createElement(Text, { style: styles.fieldValue }, "—");

  if (type === "signature" && typeof value === "string" && value.startsWith("data:image/")) {
    return createElement(Image, { src: value, style: styles.signatureImage });
  }
  if (type === "checkbox") {
    return createElement(Text, { style: styles.fieldValue }, value ? "☑ Yes" : "☐ No");
  }
  if (type === "checklist" && Array.isArray(value)) {
    return createElement(Text, { style: styles.fieldValue }, value.length ? value.join(", ") : "None selected");
  }
  if (type === "date" && typeof value === "string") {
    return createElement(Text, { style: styles.fieldValue }, formatDate(value));
  }
  return createElement(Text, { style: styles.fieldValue }, String(value));
}

export function TableFieldPdf({ field, value }: { field: TemplateField; value: unknown }) {
  const columns = field.columns ?? [];
  const rows = Array.isArray(value) ? (value as TableRowValue[]) : [];

  if (rows.length === 0) {
    return createElement(Text, { style: styles.fieldValue }, "—");
  }

  return createElement(
    View,
    { style: styles.table },
    createElement(
      View,
      { style: styles.tableHeaderRow },
      ...columns.map((col) => createElement(Text, { key: col.id, style: styles.tableHeaderCell }, col.label)),
    ),
    ...rows.map((row, i) =>
      createElement(
        View,
        { key: i, style: styles.tableRow },
        ...columns.map((col) => createElement(Text, { key: col.id, style: styles.tableCell }, row[col.id] || "—")),
      )
    ),
  );
}

export function SignatureListPdf({ value }: { value: unknown }) {
  const entries = Array.isArray(value) ? (value as SignatureListEntry[]) : [];

  if (entries.length === 0) {
    return createElement(Text, { style: styles.fieldValue }, "—");
  }

  return createElement(
    View,
    null,
    ...entries.map((entry, i) =>
      createElement(
        View,
        { key: i, style: styles.signatureListEntry },
        createElement(Text, { style: styles.signatureListName }, entry.name || "—"),
        entry.signature
          ? createElement(Image, { src: entry.signature, style: styles.signatureImage })
          : createElement(Text, { style: styles.fieldValue }, "No signature"),
      )
    ),
  );
}

function renderField(field: TemplateField, values: DocumentValues) {
  const value = values[field.id] ?? null;

  if (field.type === "table") {
    return createElement(
      View,
      { key: field.id, style: styles.fullWidthField },
      createElement(Text, { style: styles.fullWidthLabel }, field.label),
      createElement(TableFieldPdf, { field, value }),
    );
  }

  if (field.type === "signature-list") {
    return createElement(
      View,
      { key: field.id, style: styles.fullWidthField },
      createElement(Text, { style: styles.fullWidthLabel }, field.label),
      createElement(SignatureListPdf, { value }),
    );
  }

  return createElement(
    View,
    { key: field.id, style: styles.fieldRow },
    createElement(Text, { style: styles.fieldLabel }, field.label),
    createElement(FieldValue, { type: field.type, value }),
  );
}

export async function generatePdf({ document, template, job, createdBy, businessName, logoUrl }: GeneratePdfArgs): Promise<Buffer> {
  const customSections = (template.sections as unknown as TemplateSections) ?? [];
  const sections = mergeSections(template.type, customSections);
  const values   = (document.values ?? {}) as DocumentValues;
  const showDisclaimer = hasStatutoryContent(template.type);

  const headerContent = [
    createElement(Text, { style: styles.typeBadge }, template.type.toUpperCase()),
    createElement(Text, { style: styles.docTitle }, template.name),
    createElement(Text, { style: styles.headerMeta }, `Job: ${job.customerName} — ${job.siteName}`),
    createElement(Text, { style: styles.headerMeta }, `Submitted by: ${createdBy.name}`),
    createElement(Text, { style: styles.headerMeta }, `Date: ${document.submittedAt ? new Date(document.submittedAt).toLocaleDateString("en-AU") : "—"}`),
  ];

  const headerRow = logoUrl
    ? createElement(
        View,
        { style: styles.headerRow },
        createElement(Image, { src: logoUrl, style: styles.logoImage }),
        createElement(
          View,
          { style: styles.headerText },
          ...(businessName ? [createElement(Text, { style: styles.companyName }, businessName)] : []),
          ...headerContent,
        ),
      )
    : createElement(
        View,
        null,
        ...(businessName ? [createElement(Text, { style: styles.companyName }, businessName)] : []),
        ...headerContent,
      );

  const docElement = createElement(
    Document,
    null,
    createElement(
      Page,
      { size: "A4", style: styles.page },
      // Header
      createElement(
        View,
        { style: styles.header },
        headerRow,
      ),
      // Sections
      ...sections.map((section) =>
        createElement(
          View,
          { key: section.id, style: styles.section },
          createElement(Text, { style: styles.sectionTitle }, section.title),
          ...section.fields.map((field) => renderField(field, values)),
        )
      ),
      // Disclaimer (SWMS / WHS Management Plan only)
      ...(showDisclaimer
        ? [createElement(Text, { style: styles.disclaimer, fixed: true }, DISCLAIMER_TEXT)]
        : []),
      // Footer
      createElement(
        Text,
        { style: styles.footer, fixed: true },
        `Generated by ${businessName ?? "CT Field Ops"} · ${new Date().toLocaleString("en-AU")}`
      ),
    )
  );

  return renderToBuffer(docElement) as Promise<Buffer>;
}
