import { z } from "zod";

export const createContractSchema = z.object({
  customerId: z.string().uuid(),
  siteName: z.string().min(1, "Site name required"),
  value: z.number().positive("Contract value must be greater than zero"),
  billingCadence: z.enum(["monthly", "quarterly", "annually"]),
  serviceIntervalDays: z.number().int().positive("Service interval must be greater than zero"),
  startDate: z.string().datetime(),
});

export type CreateContractInput = z.infer<typeof createContractSchema>;

export function validateCreateContractInput(input: unknown) {
  return createContractSchema.safeParse(input);
}

const CADENCE_MONTHS: Record<CreateContractInput["billingCadence"], number> = {
  monthly: 1,
  quarterly: 3,
  annually: 12,
};

export function calculateRenewalDate(startDate: Date, billingCadence: CreateContractInput["billingCadence"]): Date {
  const renewal = new Date(startDate.getTime());
  renewal.setUTCMonth(renewal.getUTCMonth() + CADENCE_MONTHS[billingCadence]);
  return renewal;
}
