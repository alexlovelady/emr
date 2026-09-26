import { z } from 'zod';

export const CreateProblemSchema = z.object({
  encounterId: z.string().uuid().nullish(),
  codeSystem: z.string().min(1).max(50),
  code: z.string().min(1).max(50),
  displayName: z.string().min(1).max(300),
  onsetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  notes: z.string().max(2000).nullish(),
});
export type CreateProblemInput = z.infer<typeof CreateProblemSchema>;

export const UpdateProblemStatusSchema = z.object({
  clinicalStatus: z.enum(['active', 'resolved', 'inactive']),
});
export type UpdateProblemStatusInput = z.infer<typeof UpdateProblemStatusSchema>;
