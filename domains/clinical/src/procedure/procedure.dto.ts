import { z } from 'zod';

export const CreateProcedureSchema = z.object({
  codeSystem: z.string().max(50).nullish(),
  code: z.string().max(50).nullish(),
  displayName: z.string().min(1).max(300),
  notes: z.string().max(2000).nullish(),
});
export type CreateProcedureInput = z.infer<typeof CreateProcedureSchema>;
