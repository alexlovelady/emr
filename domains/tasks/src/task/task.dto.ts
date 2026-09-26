import { z } from 'zod';

export const CreateTaskSchema = z.object({
  patientId: z.string().uuid().nullish(),
  assignedToUserId: z.string().uuid().nullish(),
  assignedToRoleId: z.string().uuid().nullish(),
  taskType: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).nullish(),
  dueAt: z.coerce.date().nullish(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  relatedResourceType: z.string().min(1).max(100).nullish(),
  relatedResourceId: z.string().uuid().nullish(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
