import { z } from 'zod';

export const ChargePaymentSchema = z.object({
  amountCents: z.number().int().positive(),
  currency: z.string().min(1).max(10).default('usd'),
  paymentMethodToken: z.string().min(1),
});
export type ChargePaymentInput = z.infer<typeof ChargePaymentSchema>;
