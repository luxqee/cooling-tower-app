import { z } from "zod";

export const communicationInputSchema = z.object({
  type: z.enum(["client_call", "internal_note", "field_instruction"]),
  body: z.string().min(1, "Please enter a note"),
});

export type CommunicationInput = z.infer<typeof communicationInputSchema>;

export function validateCommunicationInput(input: unknown) {
  return communicationInputSchema.safeParse(input);
}
