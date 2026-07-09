import { z } from "zod";

export const voiceNoteInputSchema = z.object({
  audioUrl: z.string().url(),
  durationSeconds: z.number().positive(),
});

export function validateVoiceNoteInput(input: unknown) {
  return voiceNoteInputSchema.safeParse(input);
}
