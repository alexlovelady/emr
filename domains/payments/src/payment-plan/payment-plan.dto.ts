import { z } from 'zod';

export const CreatePaymentPlanSchema = z.object({
  totalAmountCents: z.number().int().positive(),
  installmentCount: z.number().int().min(2).max(60),
  frequency: z.enum(['weekly', 'biweekly', 'monthly']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
});
export type CreatePaymentPlanInput = z.infer<typeof CreatePaymentPlanSchema>;

export const PayInstallmentSchema = z.object({
  method: z.enum(['card', 'ach', 'cash', 'check']),
  paymentMethodToken: z.string().min(1).nullish(),
  bankAccountToken: z.string().min(1).nullish(),
  referenceNumber: z.string().min(1).max(100).nullish(),
});
export type PayInstallmentInput = z.infer<typeof PayInstallmentSchema>;
