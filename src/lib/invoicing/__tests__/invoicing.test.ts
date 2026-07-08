import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-pdf")),
  Document: ({ children }: any) => children,
  Page: ({ children }: any) => children,
  View: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Image: () => null,
  StyleSheet: { create: (s: any) => s },
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: "email-id" }) },
  })),
}));

import { generateInvoicePdf } from "../generateInvoicePdf";
import { sendInvoiceEmail } from "../sendInvoiceEmail";

const basePdfData = {
  invoice: {
    invoiceNumber: "INV-2026-0001",
    baseAmount: 1800,
    variationsTotal: 450,
    totalAmount: 2250,
    notes: null,
    createdAt: new Date("2026-07-08T00:00:00Z").toISOString(),
  },
  variations: [{ description: "Replace fill packs", costEstimate: 450 }],
  job: { customerName: "Rio Tinto", siteName: "Weipa Plant", siteAddress: "1 Mine Rd, Weipa QLD 4874", jobType: "Annual Service" },
  businessProfile: { name: "CT Field Ops", abn: "12 345 678 901", address: "Brisbane QLD", logoUrl: null, paymentTerms: "Payment due 14 days" },
};

beforeEach(() => vi.clearAllMocks());

describe("generateInvoicePdf", () => {
  it("returns a Buffer", async () => {
    const result = await generateInvoicePdf(basePdfData);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("does not throw with no variations", async () => {
    await expect(generateInvoicePdf({ ...basePdfData, variations: [] })).resolves.not.toThrow();
  });

  it("does not throw with no logo or payment terms", async () => {
    const data = { ...basePdfData, businessProfile: { ...basePdfData.businessProfile, logoUrl: null, paymentTerms: null } };
    await expect(generateInvoicePdf(data)).resolves.not.toThrow();
  });
});

describe("sendInvoiceEmail", () => {
  it("does not throw for valid opts", async () => {
    await expect(
      sendInvoiceEmail({
        to: "client@example.com",
        from: "invoices@ct.com",
        invoiceNumber: "INV-2026-0001",
        jobDescription: "Annual Service — Weipa Plant",
        totalAmount: 2250,
        pdfBuffer: Buffer.from("mock-pdf"),
        businessName: "CT Field Ops",
      })
    ).resolves.not.toThrow();
  });
});
