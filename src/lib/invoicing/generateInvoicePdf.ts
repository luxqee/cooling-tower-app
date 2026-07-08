import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";

export interface InvoicePdfData {
  invoice: {
    invoiceNumber: string;
    baseAmount: number;
    variationsTotal: number;
    totalAmount: number;
    notes?: string | null;
    createdAt: string;
  };
  variations: { description: string; costEstimate: number }[];
  job: { customerName: string; siteName: string; siteAddress: string; jobType: string };
  businessProfile: {
    name: string;
    abn: string;
    address: string;
    logoUrl?: string | null;
    paymentTerms?: string | null;
  };
}

const styles = StyleSheet.create({
  page:       { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  headerRow:  { flexDirection: "row", justifyContent: "space-between", marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  logoImg:    { width: 48, height: 48, marginBottom: 4 },
  bizName:    { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  bizMeta:    { fontSize: 9, color: "#64748b" },
  invTitle:   { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right", marginBottom: 4 },
  invMeta:    { fontSize: 9, color: "#64748b", textAlign: "right" },
  billSection:{ marginBottom: 24 },
  sectionLabel:{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#64748b", marginBottom: 4, textTransform: "uppercase" },
  billTo:     { fontSize: 10 },
  divider:    { borderBottomWidth: 0.5, borderBottomColor: "#cbd5e1", marginBottom: 8, marginTop: 8 },
  tableHeader:{ flexDirection: "row", paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: "#cbd5e1", marginBottom: 4 },
  tableHDesc: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 9, color: "#475569" },
  tableHAmt:  { width: 80, fontFamily: "Helvetica-Bold", fontSize: 9, color: "#475569", textAlign: "right" },
  lineRow:    { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: "#f1f5f9" },
  lineDesc:   { flex: 1, fontSize: 10 },
  lineAmt:    { width: 80, fontSize: 10, textAlign: "right" },
  totalRow:   { flexDirection: "row", paddingTop: 10, marginTop: 4 },
  totalLabel: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 11, textAlign: "right", paddingRight: 12 },
  totalAmt:   { width: 80, fontFamily: "Helvetica-Bold", fontSize: 11, textAlign: "right" },
  notes:      { marginTop: 20, fontSize: 9, color: "#64748b", fontStyle: "italic" },
  footer:     { position: "absolute", bottom: 24, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 6, fontSize: 8, color: "#94a3b8", textAlign: "center" },
  paymentTerms:{ marginTop: 16, fontSize: 9, color: "#475569" },
});

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-AU"); } catch { return iso; }
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const { invoice, variations, job, businessProfile: bp } = data;

  const bizLeft = [
    ...(bp.logoUrl ? [createElement(Image, { src: bp.logoUrl, style: styles.logoImg })] : []),
    createElement(Text, { style: styles.bizName }, bp.name),
    ...(bp.abn ? [createElement(Text, { style: styles.bizMeta }, `ABN: ${bp.abn}`)] : []),
    ...(bp.address ? [createElement(Text, { style: styles.bizMeta }, bp.address)] : []),
  ];

  const invRight = [
    createElement(Text, { style: styles.invTitle }, "INVOICE"),
    createElement(Text, { style: styles.invMeta }, invoice.invoiceNumber),
    createElement(Text, { style: styles.invMeta }, `Date: ${fmtDate(invoice.createdAt)}`),
  ];

  const lineItems = [
    { description: `Labour — ${job.jobType}`, amount: invoice.baseAmount },
    ...variations.map((v) => ({ description: `Variation: ${v.description}`, amount: v.costEstimate })),
  ];

  const doc = createElement(
    Document,
    null,
    createElement(
      Page,
      { size: "A4", style: styles.page },
      // Header
      createElement(
        View,
        { style: styles.headerRow },
        createElement(View, null, ...bizLeft),
        createElement(View, null, ...invRight),
      ),
      // Bill To
      createElement(
        View,
        { style: styles.billSection },
        createElement(Text, { style: styles.sectionLabel }, "Bill To"),
        createElement(Text, { style: styles.billTo }, job.customerName),
        createElement(Text, { style: styles.billTo }, job.siteName),
        createElement(Text, { style: styles.billTo }, job.siteAddress),
      ),
      // Line items table
      createElement(
        View,
        { style: styles.tableHeader },
        createElement(Text, { style: styles.tableHDesc }, "Description"),
        createElement(Text, { style: styles.tableHAmt }, "Amount"),
      ),
      ...lineItems.map((line, i) =>
        createElement(
          View,
          { key: String(i), style: styles.lineRow },
          createElement(Text, { style: styles.lineDesc }, line.description),
          createElement(Text, { style: styles.lineAmt }, fmtMoney(line.amount)),
        )
      ),
      // Total
      createElement(
        View,
        { style: styles.totalRow },
        createElement(Text, { style: styles.totalLabel }, "Total:"),
        createElement(Text, { style: styles.totalAmt }, fmtMoney(invoice.totalAmount)),
      ),
      // Notes
      ...(invoice.notes
        ? [createElement(Text, { style: styles.notes }, `Notes: ${invoice.notes}`)]
        : []),
      // Payment terms
      ...(bp.paymentTerms
        ? [createElement(Text, { style: styles.paymentTerms }, bp.paymentTerms)]
        : []),
      // Footer
      createElement(
        Text,
        { style: styles.footer, fixed: true },
        `Generated by ${bp.name} · ${new Date().toLocaleString("en-AU")}`
      ),
    )
  );

  return renderToBuffer(doc) as Promise<Buffer>;
}
