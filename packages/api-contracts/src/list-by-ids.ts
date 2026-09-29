import { z } from 'zod';

/** Shared shape for a "give me these specific rows" bulk lookup (e.g. resolving a list of ids to
 * display names) — used as a POST body since a GET query string is an awkward place for an
 * arbitrarily long id list. */
export const ListByIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});
export type ListByIdsInput = z.infer<typeof ListByIdsSchema>;
