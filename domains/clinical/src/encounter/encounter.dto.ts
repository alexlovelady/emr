import { z } from 'zod';

export const CreateEncounterSchema = z.object({
  appointmentId: z.string().uuid(),
  encounterType: z.string().min(1).max(200),
  chiefComplaint: z.string().max(1000).nullish(),
});
export type CreateEncounterInput = z.infer<typeof CreateEncounterSchema>;
