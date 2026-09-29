import { z } from 'zod';

/**
 * Opt-in `limit`/`offset` for a list endpoint. Omitting both preserves every existing caller's
 * behavior exactly (dropdown populators, N+1-replacement bulk fetches, etc. all call `list()` with
 * no pagination params today and must keep getting every row back) — pagination only kicks in when
 * a caller explicitly asks for it.
 */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
