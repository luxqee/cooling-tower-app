import { describe, it, expect } from "vitest";
import { validateChatInput } from "../validate";

describe("validateChatInput", () => {
  it("accepts a message with no sessionId", () => {
    expect(validateChatInput({ message: "hello" }).success).toBe(true);
  });

  it("accepts a message with a sessionId", () => {
    expect(validateChatInput({ message: "hello", sessionId: "sess-1" }).success).toBe(true);
  });

  it("rejects an empty message", () => {
    expect(validateChatInput({ message: "" }).success).toBe(false);
  });

  it("rejects a missing message", () => {
    expect(validateChatInput({}).success).toBe(false);
  });

  it("rejects a message over 4000 characters", () => {
    expect(validateChatInput({ message: "a".repeat(4001) }).success).toBe(false);
  });

  it("accepts a message at exactly 4000 characters", () => {
    expect(validateChatInput({ message: "a".repeat(4000) }).success).toBe(true);
  });

  it("accepts a confirmAction with a sessionId and no message", () => {
    const result = validateChatInput({
      sessionId: "sess-1",
      confirmAction: { tool: "draftVariation", input: { jobId: "j1", technicianName: "Jake", description: "x", costEstimate: 50 } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a confirmAction with no sessionId", () => {
    const result = validateChatInput({
      confirmAction: { tool: "draftQuote", input: {} },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a confirmAction with an unknown tool name", () => {
    const result = validateChatInput({
      sessionId: "sess-1",
      confirmAction: { tool: "deleteEverything", input: {} },
    });
    expect(result.success).toBe(false);
  });
});
