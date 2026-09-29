import { z } from 'zod';

/** Item 24 — `encounterId` is optional SMART launch context (the `encounter` launch parameter);
 * omitted, an EHR launch carries patient context only, same as most real EHR launch points. */
export const SmartLaunchCreateSchema = z.object({
  clientId: z.string().min(1),
  encounterId: z.string().uuid().nullish(),
});
export type SmartLaunchCreateInput = z.infer<typeof SmartLaunchCreateSchema>;
