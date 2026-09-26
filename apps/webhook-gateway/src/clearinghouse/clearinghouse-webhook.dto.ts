import { z } from 'zod';

export const ClearinghouseAckSchema = z
  .object({
    clearinghouseTransactionId: z.string().min(1),
    outcome: z.enum(['accepted', 'rejected']),
    rejectionReasonCode: z.string().min(1).nullish(),
    rejectionReasonDescription: z.string().min(1).nullish(),
  })
  .refine((v) => v.outcome !== 'rejected' || (v.rejectionReasonCode != null && v.rejectionReasonDescription != null), {
    message: 'rejectionReasonCode and rejectionReasonDescription are required when outcome is rejected',
  });
export type ClearinghouseAckInput = z.infer<typeof ClearinghouseAckSchema>;

export const ClearinghouseRemittanceSchema = z.object({
  clearinghouseTransactionId: z.string().min(1),
  remittanceAdviceNumber: z.string().min(1).nullish(),
  payerPaidAmount: z.number().min(0),
  adjustmentAmount: z.number().min(0).default(0),
  patientResponsibilityAmount: z.number().min(0).default(0),
  denialReasonCode: z.string().min(1).nullish(),
  denialReasonText: z.string().min(1).nullish(),
});
export type ClearinghouseRemittanceInput = z.infer<typeof ClearinghouseRemittanceSchema>;
