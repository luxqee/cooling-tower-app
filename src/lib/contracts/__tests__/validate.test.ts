import { describe, it, expect } from "vitest";
import { calculateRenewalDate } from "../validate";

describe("calculateRenewalDate", () => {
  it("adds 1 month for monthly cadence", () => {
    const result = calculateRenewalDate(new Date("2026-01-15T00:00:00Z"), "monthly");
    expect(result.toISOString().slice(0, 10)).toBe("2026-02-15");
  });

  it("adds 3 months for quarterly cadence", () => {
    const result = calculateRenewalDate(new Date("2026-01-15T00:00:00Z"), "quarterly");
    expect(result.toISOString().slice(0, 10)).toBe("2026-04-15");
  });

  it("adds 12 months for annually cadence", () => {
    const result = calculateRenewalDate(new Date("2026-01-15T00:00:00Z"), "annually");
    expect(result.toISOString().slice(0, 10)).toBe("2027-01-15");
  });

  it("does not mutate the input date", () => {
    const start = new Date("2026-01-15T00:00:00Z");
    calculateRenewalDate(start, "monthly");
    expect(start.toISOString().slice(0, 10)).toBe("2026-01-15");
  });
});
