import { describe, it, expect } from "vitest";
import { validateVoiceNoteInput } from "../validate";

describe("validateVoiceNoteInput", () => {
  const valid = {
    audioUrl: "https://example.blob.vercel-storage.com/voice-notes/u1/123.webm",
    durationSeconds: 42,
  };

  it("accepts a valid payload", () => {
    expect(validateVoiceNoteInput(valid).success).toBe(true);
  });

  it("rejects a non-URL audioUrl", () => {
    const result = validateVoiceNoteInput({ ...valid, audioUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing durationSeconds", () => {
    const { durationSeconds, ...rest } = valid;
    const result = validateVoiceNoteInput(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative durationSeconds", () => {
    expect(validateVoiceNoteInput({ ...valid, durationSeconds: 0 }).success).toBe(false);
    expect(validateVoiceNoteInput({ ...valid, durationSeconds: -5 }).success).toBe(false);
  });
});
