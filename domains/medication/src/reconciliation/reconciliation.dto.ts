import { z } from 'zod';

export const RecordReconciliationSchema = z.object({
  encounterId: z.string().uuid(),
  notes: z.string().max(2000).nullish(),
});
export type RecordReconciliationInput = z.infer<typeof RecordReconciliationSchema>;
