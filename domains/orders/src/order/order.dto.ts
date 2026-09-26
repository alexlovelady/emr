import { z } from 'zod';

export const CreateOrderSchema = z.object({
  encounterId: z.string().uuid(),
  orderingPractitionerId: z.string().uuid(),
  orderType: z.string().min(1).max(100),
  codeSystem: z.string().max(50).nullish(),
  code: z.string().max(50).nullish(),
  displayName: z.string().min(1).max(300),
  priority: z.enum(['routine', 'urgent', 'stat']).default('routine'),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
