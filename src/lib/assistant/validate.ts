import { z } from "zod";

// A chat request is either a normal message, or a confirmation of a
// previously-proposed draft action (sessionId required for the latter — you
// can't confirm an action without resuming the session it was proposed in).
export const chatInputSchema = z
  .object({
    sessionId: z.string().optional(),
    message: z.string().min(1).max(4000).optional(),
    confirmAction: z
      .object({
        tool: z.enum(["draftVariation", "draftQuote"]),
        input: z.record(z.string(), z.unknown()),
      })
      .optional(),
  })
  .refine((data) => data.message !== undefined || data.confirmAction !== undefined, {
    message: "Either message or confirmAction is required",
  })
  .refine((data) => data.confirmAction === undefined || data.sessionId !== undefined, {
    message: "sessionId is required to confirm an action",
  });

export function validateChatInput(input: unknown) {
  return chatInputSchema.safeParse(input);
}
