import { z } from 'zod';

export const CreateResourceSchema = z.object({
  locationId: z.string().uuid(),
  name: z.string().min(1).max(200),
  resourceType: z.string().min(1).max(100),
});
export type CreateResourceInput = z.infer<typeof CreateResourceSchema>;

export const ListResourcesQuerySchema = z.object({
  locationId: z.string().uuid().optional(),
});
export type ListResourcesQuery = z.infer<typeof ListResourcesQuerySchema>;
