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

import { generateQuotePdf } from "../generateQuotePdf";

const basePdfData = {
  quote: {
    customerName: "Rio Tinto",
    siteName: "Weipa Plant",
    jobType: "Annual Service",
    lineItems: [{ description: "Labour", qty: 8, unitPrice: 95 }],
    totalAmount: 760,
    validUntil: "2026-08-08T00:00:00Z",
    createdAt: new Date("2026-07-08T00:00:00Z").toISOString(),
  },
  businessProfile: { name: "CT Field Ops", abn: "12 345 678 901", address: "Brisbane QLD", logoUrl: null, paymentTerms: "Payment due 14 days" },
};

beforeEach(() => vi.clearAllMocks());

describe("generateQuotePdf", () => {
  it("returns a Buffer", async () => {
    const result = await generateQuotePdf(basePdfData);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("does not throw with no validUntil date", async () => {
    await expect(
      generateQuotePdf({ ...basePdfData, quote: { ...basePdfData.quote, validUntil: null } })
    ).resolves.not.toThrow();
  });

  it("does not throw with multiple line items", async () => {
    const data = {
      ...basePdfData,
      quote: {
        ...basePdfData.quote,
        lineItems: [
          { description: "Labour", qty: 8, unitPrice: 95 },
          { description: "Callout fee", qty: 1, unitPrice: 150 },
        ],
      },
    };
    await expect(generateQuotePdf(data)).resolves.not.toThrow();
  });

  it("does not throw with no logo or payment terms", async () => {
    const data = { ...basePdfData, businessProfile: { ...basePdfData.businessProfile, logoUrl: null, paymentTerms: null } };
    await expect(generateQuotePdf(data)).resolves.not.toThrow();
  });
});
