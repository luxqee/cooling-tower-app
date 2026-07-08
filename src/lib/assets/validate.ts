import { z } from "zod";

export const createAssetSchema = z.object({
  customerId: z.string().uuid(),
  serialNumber: z.string().min(1, "Serial number required"),
  assetType: z.string().min(1, "Asset type required"),
  location: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export function validateCreateAssetInput(input: unknown) {
  return createAssetSchema.safeParse(input);
}
