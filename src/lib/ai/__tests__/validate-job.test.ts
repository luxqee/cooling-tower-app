import { describe, it, expect } from "vitest";
import { validateAiValidateInput, checkImplausibleValues } from "../validate-job";

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

describe("checkImplausibleValues", () => {
  const valid = {
    customerName: "Rio Tinto",
    siteName: "Weipa Plant",
    siteAddress: "1 Bauxite Rd, Weipa QLD",
    jobType: "Annual Service",
    quotedHours: 32,
    quotedCost: 7000,
  };

  it("returns no flags for a plausible job matching the business's hourly rate", () => {
    const flags = checkImplausibleValues(valid, 220);
    expect(flags).toEqual([]);
  });

  it("flags quotedHours over 200 regardless of cost", () => {
    const flags = checkImplausibleValues({ ...valid, quotedHours: 400 }, null);
    expect(flags).toHaveLength(1);
    expect(flags[0].field).toBe("quotedHours");
    expect(flags[0].severity).toBe("warning");
  });

  it("does not flag quotedHours under 200 when no hourly rate is configured", () => {
    const { quotedCost, ...rest } = valid;
    const flags = checkImplausibleValues(rest, null);
    expect(flags).toEqual([]);
  });

  it("flags a quotedCost that implies a rate far below the business's configured hourly rate", () => {
    const flags = checkImplausibleValues({ ...valid, quotedHours: 8, quotedCost: 50 }, 145);
    expect(flags.some((f) => f.field === "quotedCost")).toBe(true);
  });

  it("flags a quotedCost that implies a rate far above the business's configured hourly rate", () => {
    const flags = checkImplausibleValues({ ...valid, quotedHours: 8, quotedCost: 50000 }, 145);
    expect(flags.some((f) => f.field === "quotedCost")).toBe(true);
  });

  it("skips the rate check when no hourly rate is configured", () => {
    const flags = checkImplausibleValues({ ...valid, quotedHours: 8, quotedCost: 50 }, null);
    expect(flags).toEqual([]);
  });

  it("skips the rate check when quotedCost is not provided", () => {
    const { quotedCost, ...rest } = valid;
    const flags = checkImplausibleValues(rest, 220);
    expect(flags).toEqual([]);
  });
});
