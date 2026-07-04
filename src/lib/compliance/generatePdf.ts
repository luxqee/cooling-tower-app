import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import type { ComplianceDocument, ComplianceTemplate, Job, User } from "@prisma/client";
import type { TemplateSections, DocumentValues } from "./types";

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
  companyName:   { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1e293b", marginBottom: 6 },
});

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

export async function generatePdf({ document, template, job, createdBy, businessName, logoUrl }: GeneratePdfArgs): Promise<Buffer> {
  const sections = template.sections as unknown as TemplateSections;
  const values   = (document.values ?? {}) as DocumentValues;

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
          ...section.fields.map((field) =>
            createElement(
              View,
              { key: field.id, style: styles.fieldRow },
              createElement(Text, { style: styles.fieldLabel }, field.label),
              createElement(FieldValue, { type: field.type, value: values[field.id] ?? null }),
            )
          ),
        )
      ),
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
