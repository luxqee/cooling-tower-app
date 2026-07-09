import { z } from "zod";

export const voiceNoteInputSchema = z.object({
  audioUrl: z.string().url(),
  durationSeconds: z.number().positive(),
  mediaType: z.enum(["audio", "video"]),
});

export function validateVoiceNoteInput(input: unknown) {
  return voiceNoteInputSchema.safeParse(input);
}

export const sendVoiceNoteInputSchema = z.object({
  transcript: z.string().min(1),
  photoUrls: z.array(z.string().url()).max(6).optional().default([]),
});

export function validateSendVoiceNoteInput(input: unknown) {
  return sendVoiceNoteInputSchema.safeParse(input);
}
