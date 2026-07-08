import { z } from "zod";

const lineItemSchema = z.object({
  description: z.string().min(1),
  qty: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});

export const createQuoteSchema = z.object({
  customerName: z.string().min(1, "Customer name required"),
  siteName: z.string().min(1, "Site name required"),
  jobType: z.string().min(1, "Job type required"),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item required"),
  validUntil: z.string().datetime().optional(),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export function validateCreateQuoteInput(input: unknown) {
  return createQuoteSchema.safeParse(input);
}

export function calculateQuoteTotal(lineItems: { qty: number; unitPrice: number }[]): number {
  return lineItems.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);
}
