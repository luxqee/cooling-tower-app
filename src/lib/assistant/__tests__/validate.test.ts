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
});
