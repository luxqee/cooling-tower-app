import { z } from "zod";

export const validateJobInputSchema = z.object({
  customerName: z.string().min(1),
  siteName: z.string().min(1),
  siteAddress: z.string().min(1),
  jobType: z.string().min(1),
  quotedHours: z.number().positive(),
  quotedCost: z.number().nonnegative().optional(),
});

export type ValidateJobInput = z.infer<typeof validateJobInputSchema>;

export function validateAiValidateInput(input: unknown) {
  return validateJobInputSchema.safeParse(input);
}

export const aiFlagSchema = z.object({
  field: z.string(),
  severity: z.enum(["warning", "info"]),
  message: z.string(),
  suggestion: z.string().nullable(),
});

export type AiFlag = z.infer<typeof aiFlagSchema>;

export const aiFlagsResponseSchema = z.object({
  flags: z.array(aiFlagSchema),
});
