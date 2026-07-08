import { describe, it, expect } from "vitest";
import { validateAiValidateInput } from "../validate-job";

describe("validateAiValidateInput", () => {
  const valid = {
    customerName: "Rio Tinto",
    siteName: "Weipa Plant",
    siteAddress: "1 Bauxite Rd, Weipa QLD",
    jobType: "Annual Service",
    quotedHours: 32,
    quotedCost: 7000,
  };

  it("accepts a complete valid job form payload", () => {
    const result = validateAiValidateInput(valid);
    expect(result.success).toBe(true);
  });

  it("accepts quotedCost as optional (undefined)", () => {
    const { quotedCost, ...rest } = valid;
    const result = validateAiValidateInput(rest);
    expect(result.success).toBe(true);
  });

  it("rejects a payload missing siteName", () => {
    const { siteName, ...rest } = valid;
    const result = validateAiValidateInput(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a negative quotedHours", () => {
    const result = validateAiValidateInput({ ...valid, quotedHours: -5 });
    expect(result.success).toBe(false);
  });
});
