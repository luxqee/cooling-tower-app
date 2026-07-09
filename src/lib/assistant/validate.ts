import { z } from "zod";

export const chatInputSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1).max(4000),
});

export function validateChatInput(input: unknown) {
  return chatInputSchema.safeParse(input);
}
