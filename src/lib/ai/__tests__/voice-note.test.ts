import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../client", () => ({ getAnthropicClient: vi.fn() }));

import { getAnthropicClient } from "../client";
import { summarizeTranscript, voiceNoteSummarySchema } from "../voice-note";

beforeEach(() => vi.clearAllMocks());

describe("voiceNoteSummarySchema", () => {
  it("accepts a valid summary object", () => {
    const result = voiceNoteSummarySchema.safeParse({
      summary: "Replaced fan belt on Tower 3.",
      actionItems: ["Order replacement belt for Tower 2", "Follow up with client on quote"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a payload with a non-array actionItems", () => {
    const result = voiceNoteSummarySchema.safeParse({ summary: "x", actionItems: "not an array" });
    expect(result.success).toBe(false);
  });
});

describe("summarizeTranscript", () => {
  it("calls Claude with the transcript and returns parsed summary + token usage", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{
        type: "text",
        text: JSON.stringify({
          summary: "Replaced fan belt on Tower 3, minor corrosion noted on Tower 2.",
          actionItems: ["Quote Tower 2 corrosion repair"],
        }),
      }],
      usage: { input_tokens: 150, output_tokens: 40 },
    });
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: mockCreate } } as any);

    const result = await summarizeTranscript("Today I replaced the fan belt on Tower 3...");

    expect(result.summary.summary).toBe("Replaced fan belt on Tower 3, minor corrosion noted on Tower 2.");
    expect(result.summary.actionItems).toEqual(["Quote Tower 2 corrosion repair"]);
    expect(result.promptTokens).toBe(150);
    expect(result.outputTokens).toBe(40);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5" })
    );
  });

  it("defaults to a generic system prompt when no industry description is given", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ summary: "x", actionItems: [] }) }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: mockCreate } } as any);

    await summarizeTranscript("some transcript");

    const [callArg] = mockCreate.mock.calls[0];
    expect(callArg.system).toContain("field service maintenance");
  });

  it("interpolates a custom industry description into the system prompt", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ summary: "x", actionItems: [] }) }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    vi.mocked(getAnthropicClient).mockReturnValue({ messages: { create: mockCreate } } as any);

    await summarizeTranscript("some transcript", "HVAC servicing");

    const [callArg] = mockCreate.mock.calls[0];
    expect(callArg.system).toContain("HVAC servicing");
    expect(callArg.system).not.toContain("cooling tower");
  });
});
