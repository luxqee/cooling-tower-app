import { z } from "zod";
import { getAnthropicClient } from "./client";
import { AI_MODELS } from "./models";

export const voiceNoteSummarySchema = z.object({
  summary: z.string(),
  actionItems: z.array(z.string()),
});

export type VoiceNoteSummary = z.infer<typeof voiceNoteSummarySchema>;

const MODEL = AI_MODELS.VOICE_NOTE_SUMMARY;

export async function summarizeTranscript(
  transcript: string,
  industryDescription = "field service maintenance"
): Promise<{
  summary: VoiceNoteSummary;
  promptTokens: number;
  outputTokens: number;
}> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      `You summarize field technician voice notes from ${industryDescription} visits. Write a concise summary (2-4 sentences) and extract concrete action items as a plain list. If there are no action items, return an empty array. Respond with JSON matching the schema exactly.`,
    messages: [{ role: "user", content: `Summarize this voice note transcript:\n${transcript}` }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            actionItems: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "actionItems"],
          additionalProperties: false,
        },
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const rawJson = textBlock && "text" in textBlock ? textBlock.text : "{}";
  const summary = voiceNoteSummarySchema.parse(JSON.parse(rawJson));

  return {
    summary,
    promptTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
