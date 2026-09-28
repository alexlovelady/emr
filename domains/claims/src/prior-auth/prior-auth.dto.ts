import { z } from 'zod';

export const CreatePriorAuthorizationSchema = z.object({
  coverageId: z.string().uuid(),
  requestedByPractitionerId: z.string().uuid(),
  procedureCode: z.string().min(1).max(20),
  procedureDescription: z.string().min(1).max(300),
  diagnosisCode: z.string().min(1).max(20),
  notes: z.string().min(1).max(2000).nullish(),
});
export type CreatePriorAuthorizationInput = z.infer<typeof CreatePriorAuthorizationSchema>;

/** No live payer API exists — this records a decision staff learned about through whatever channel
 * the payer actually uses (portal, fax, phone), it does not itself request or receive anything. */
export const RecordPriorAuthDecisionSchema = z.object({
  decision: z.enum(['approved', 'denied']),
  payerReferenceNumber: z.string().min(1).max(100).nullish(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  denialReason: z.string().min(1).max(2000).nullish(),
});
export type RecordPriorAuthDecisionInput = z.infer<typeof RecordPriorAuthDecisionSchema>;

export const CancelPriorAuthorizationSchema = z.object({
  notes: z.string().min(1).max(2000).nullish(),
});
export type CancelPriorAuthorizationInput = z.infer<typeof CancelPriorAuthorizationSchema>;
