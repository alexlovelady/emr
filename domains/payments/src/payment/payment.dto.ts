import { z } from 'zod';

/**
 * Staff-facing counterpart to `@ehr/portal`'s patient self-pay `ChargePaymentSchema` — this one
 * covers every method a front desk actually takes: card/ACH go through `PaymentGateway`, cash/check
 * are recorded directly (a staff member is attesting money was physically/already received, not
 * asking a processor to move it).
 */
export const RecordPaymentSchema = z
  .object({
    method: z.enum(['card', 'ach', 'cash', 'check']),
    amountCents: z.number().int().positive(),
    currency: z.string().min(1).max(10).default('usd'),
    paymentMethodToken: z.string().min(1).nullish(),
    bankAccountToken: z.string().min(1).nullish(),
    referenceNumber: z.string().min(1).max(100).nullish(),
    description: z.string().min(1).max(300).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.method === 'card' && !value.paymentMethodToken) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paymentMethodToken'], message: 'paymentMethodToken is required for card payments' });
    }
    if (value.method === 'ach' && !value.bankAccountToken) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bankAccountToken'], message: 'bankAccountToken is required for ACH payments' });
    }
    if (value.method === 'check' && !value.referenceNumber) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['referenceNumber'], message: 'referenceNumber (the check number) is required for check payments' });
    }
  });
export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>;
