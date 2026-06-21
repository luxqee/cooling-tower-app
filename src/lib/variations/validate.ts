import { z } from "zod";

export const variationInputSchema = z.object({
  jobId: z.string().uuid(),
  description: z.string().min(1, "Please enter a description"),
  costEstimate: z.number().positive("Cost estimate must be greater than zero"),
  photoUrl: z.union([z.string().url(), z.null()]),
});

export type VariationInput = z.infer<typeof variationInputSchema>;

export function validateVariationInput(input: unknown) {
  return variationInputSchema.safeParse(input);
}
