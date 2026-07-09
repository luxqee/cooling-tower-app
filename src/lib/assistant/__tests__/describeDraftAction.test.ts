import { describe, it, expect } from "vitest";
import { describeDraftAction } from "../describeDraftAction";

describe("describeDraftAction", () => {
  it("describes a draftVariation action", () => {
    const text = describeDraftAction("draftVariation", {
      jobId: "job1",
      technicianName: "Jake Morrison",
      description: "Replace fan belt",
      costEstimate: 450,
    });

    expect(text).toContain("Jake Morrison");
    expect(text).toContain("Replace fan belt");
    expect(text).toContain("$450");
  });

  it("describes a draftQuote action with a computed total", () => {
    const text = describeDraftAction("draftQuote", {
      customerName: "Rio Tinto",
      siteName: "Weipa",
      jobType: "Inspection",
      lineItems: [
        { description: "Labour", qty: 2, unitPrice: 100 },
        { description: "Parts", qty: 1, unitPrice: 50 },
      ],
    });

    expect(text).toContain("Rio Tinto");
    expect(text).toContain("Weipa");
    expect(text).toContain("Inspection");
    expect(text).toContain("2 line items");
    expect(text).toContain("$250");
  });

  it("uses singular 'line item' for a single-item quote", () => {
    const text = describeDraftAction("draftQuote", {
      customerName: "Rio Tinto",
      siteName: "Weipa",
      jobType: "Inspection",
      lineItems: [{ description: "Labour", qty: 1, unitPrice: 100 }],
    });

    expect(text).toContain("1 line item ");
  });

  it("falls back to a generic description for an unknown tool", () => {
    expect(describeDraftAction("someOtherTool", {})).toBe("Run someOtherTool?");
  });
});
