import { z } from "zod";

export const createMaterialEntrySchema = z.object({
  description: z.string().min(1, "Please enter a description"),
  supplierName: z.string().optional(),
  quantity: z.number().positive().optional(),
  estimatedCost: z.number().nonnegative("Estimated cost cannot be negative"),
});

export type CreateMaterialEntryInput = z.infer<typeof createMaterialEntrySchema>;

export function validateCreateMaterialEntryInput(input: unknown) {
  return createMaterialEntrySchema.safeParse(input);
}

export const reconcileMaterialEntrySchema = z.object({
  actualCost: z.number().nonnegative("Actual cost cannot be negative"),
  receiptUrl: z.string().url().nullable().optional(),
});

export type ReconcileMaterialEntryInput = z.infer<typeof reconcileMaterialEntrySchema>;

export function validateReconcileMaterialEntryInput(input: unknown) {
  return reconcileMaterialEntrySchema.safeParse(input);
}
