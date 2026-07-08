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

const MAX_PLAUSIBLE_HOURS = 200;
const RATE_DEVIATION_FACTOR = 2;

export function checkImplausibleValues(input: ValidateJobInput, hourlyRate: number | null): AiFlag[] {
  const flags: AiFlag[] = [];

  if (input.quotedHours > MAX_PLAUSIBLE_HOURS) {
    flags.push({
      field: "quotedHours",
      severity: "warning",
      message: `${input.quotedHours} hours is unusually high for a single job.`,
      suggestion: "Check for a typo, or consider splitting this into multiple jobs.",
    });
  }

  if (hourlyRate != null && input.quotedCost != null && input.quotedHours > 0) {
    const impliedRate = input.quotedCost / input.quotedHours;
    if (impliedRate < hourlyRate / RATE_DEVIATION_FACTOR || impliedRate > hourlyRate * RATE_DEVIATION_FACTOR) {
      flags.push({
        field: "quotedCost",
        severity: "warning",
        message: `This quote implies a rate of $${impliedRate.toFixed(2)}/hr, but your configured hourly rate is $${hourlyRate.toFixed(2)}/hr.`,
        suggestion: "Double check the quoted cost and hours.",
      });
    }
  }

  return flags;
}
