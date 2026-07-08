import { describe, it, expect } from "vitest";
import { calculateCostUsd } from "../cost";

describe("calculateCostUsd", () => {
  it("calculates Haiku 4.5 cost at $1/$5 per million tokens", () => {
    // 1000 prompt tokens = $0.001, 500 output tokens = $0.0025 -> $0.0035
    const cost = calculateCostUsd("claude-haiku-4-5", 1000, 500);
    expect(cost).toBeCloseTo(0.0035, 6);
  });

  it("calculates Sonnet 5 cost at $3/$15 per million tokens", () => {
    // 1000 prompt tokens = $0.003, 500 output tokens = $0.0075 -> $0.0105
    const cost = calculateCostUsd("claude-sonnet-5", 1000, 500);
    expect(cost).toBeCloseTo(0.0105, 6);
  });

  it("returns 0 for zero tokens", () => {
    expect(calculateCostUsd("claude-haiku-4-5", 0, 0)).toBe(0);
  });
});
