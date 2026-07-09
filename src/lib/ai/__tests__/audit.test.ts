import { describe, it, expect } from "vitest";
import { buildAiAuditLogData } from "../audit";

describe("buildAiAuditLogData", () => {
  it("computes costUsd from the model's pricing and returns a plain data object", () => {
    const data = buildAiAuditLogData({
      userId: "u1",
      feature: "voice_note",
      model: "claude-haiku-4-5",
      promptTokens: 1000,
      outputTokens: 500,
    });

    expect(data.userId).toBe("u1");
    expect(data.feature).toBe("voice_note");
    expect(data.promptTokens).toBe(1000);
    expect(data.outputTokens).toBe(500);
    expect(data.costUsd).toBeCloseTo(0.0035, 6);
    expect(data).not.toHaveProperty("toolCalls");
  });

  it("includes toolCalls only when provided", () => {
    const data = buildAiAuditLogData({
      userId: "u1",
      feature: "company_assistant",
      model: "claude-sonnet-5",
      promptTokens: 250,
      outputTokens: 35,
      toolCalls: [{ tool: "findJobs", input: { customerName: "Rio Tinto" } }],
    });

    expect(data.toolCalls).toEqual([{ tool: "findJobs", input: { customerName: "Rio Tinto" } }]);
    expect(data.costUsd).toBeCloseTo((250 / 1_000_000) * 3 + (35 / 1_000_000) * 15, 6);
  });

  it("throws for an unknown model, same as calculateCostUsd", () => {
    expect(() =>
      buildAiAuditLogData({ userId: "u1", feature: "voice_note", model: "unknown-model", promptTokens: 1, outputTokens: 1 })
    ).toThrow();
  });
});
