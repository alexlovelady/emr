import { z } from 'zod';

export const TaskSummarySchema = z.object({
  assignedToUserId: z.string().uuid().nullish(),
  patientId: z.string().uuid().nullish(),
});
export type TaskSummaryInput = z.infer<typeof TaskSummarySchema>;
