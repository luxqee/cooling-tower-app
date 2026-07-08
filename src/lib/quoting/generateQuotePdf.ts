import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";

export interface QuotePdfData {
  quote: {
    customerName: string;
    siteName: string;
    jobType: string;
    lineItems: { description: string; qty: number; unitPrice: number }[];
    totalAmount: number;
    validUntil?: string | null;
    createdAt: string;
  };
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
  quoteTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right", marginBottom: 4 },
  quoteMeta:  { fontSize: 9, color: "#64748b", textAlign: "right" },
  billSection:{ marginBottom: 24 },
  sectionLabel:{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#64748b", marginBottom: 4, textTransform: "uppercase" },
  billTo:     { fontSize: 10 },
  tableHeader:{ flexDirection: "row", paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: "#cbd5e1", marginBottom: 4 },
  tableHDesc: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 9, color: "#475569" },
  tableHQty:  { width: 50, fontFamily: "Helvetica-Bold", fontSize: 9, color: "#475569", textAlign: "right" },
  tableHAmt:  { width: 80, fontFamily: "Helvetica-Bold", fontSize: 9, color: "#475569", textAlign: "right" },
  lineRow:    { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: "#f1f5f9" },
  lineDesc:   { flex: 1, fontSize: 10 },
  lineQty:    { width: 50, fontSize: 10, textAlign: "right" },
  lineAmt:    { width: 80, fontSize: 10, textAlign: "right" },
  totalRow:   { flexDirection: "row", paddingTop: 10, marginTop: 4 },
  totalLabel: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 11, textAlign: "right", paddingRight: 12 },
  totalAmt:   { width: 80, fontFamily: "Helvetica-Bold", fontSize: 11, textAlign: "right" },
  validity:   { marginTop: 20, fontSize: 9, color: "#64748b", fontStyle: "italic" },
  footer:     { position: "absolute", bottom: 24, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 6, fontSize: 8, color: "#94a3b8", textAlign: "center" },
  paymentTerms:{ marginTop: 16, fontSize: 9, color: "#475569" },
});

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-AU"); } catch { return iso; }
}

export async function generateQuotePdf(data: QuotePdfData): Promise<Buffer> {
  const { quote, businessProfile: bp } = data;

  const bizLeft = [
    ...(bp.logoUrl ? [createElement(Image, { src: bp.logoUrl, style: styles.logoImg })] : []),
    createElement(Text, { style: styles.bizName }, bp.name),
    ...(bp.abn ? [createElement(Text, { style: styles.bizMeta }, `ABN: ${bp.abn}`)] : []),
    ...(bp.address ? [createElement(Text, { style: styles.bizMeta }, bp.address)] : []),
  ];

  const quoteRight = [
    createElement(Text, { style: styles.quoteTitle }, "QUOTE"),
    createElement(Text, { style: styles.quoteMeta }, `Date: ${fmtDate(quote.createdAt)}`),
    ...(quote.validUntil
      ? [createElement(Text, { style: styles.quoteMeta }, `Valid until: ${fmtDate(quote.validUntil)}`)]
      : []),
  ];

  const doc = createElement(
    Document,
    null,
    createElement(
      Page,
      { size: "A4", style: styles.page },
      createElement(
        View,
        { style: styles.headerRow },
        createElement(View, null, ...bizLeft),
        createElement(View, null, ...quoteRight),
      ),
      createElement(
        View,
        { style: styles.billSection },
        createElement(Text, { style: styles.sectionLabel }, "Prepared For"),
        createElement(Text, { style: styles.billTo }, quote.customerName),
        createElement(Text, { style: styles.billTo }, quote.siteName),
        createElement(Text, { style: styles.billTo }, quote.jobType),
      ),
      createElement(
        View,
        { style: styles.tableHeader },
        createElement(Text, { style: styles.tableHDesc }, "Description"),
        createElement(Text, { style: styles.tableHQty }, "Qty"),
        createElement(Text, { style: styles.tableHAmt }, "Amount"),
      ),
      ...quote.lineItems.map((line, i) =>
        createElement(
          View,
          { key: String(i), style: styles.lineRow },
          createElement(Text, { style: styles.lineDesc }, line.description),
          createElement(Text, { style: styles.lineQty }, String(line.qty)),
          createElement(Text, { style: styles.lineAmt }, fmtMoney(line.qty * line.unitPrice)),
        )
      ),
      createElement(
        View,
        { style: styles.totalRow },
        createElement(Text, { style: styles.totalLabel }, "Total:"),
        createElement(Text, { style: styles.totalAmt }, fmtMoney(quote.totalAmount)),
      ),
      createElement(Text, { style: styles.validity }, "This quote is an estimate and subject to confirmation of scope on-site."),
      ...(bp.paymentTerms
        ? [createElement(Text, { style: styles.paymentTerms }, bp.paymentTerms)]
        : []),
      createElement(
        Text,
        { style: styles.footer, fixed: true },
        `Generated by ${bp.name} · ${new Date().toLocaleString("en-AU")}`
      ),
    )
  );

  return renderToBuffer(doc) as Promise<Buffer>;
}
