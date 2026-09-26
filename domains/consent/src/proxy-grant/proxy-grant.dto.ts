import { z } from 'zod';

/**
 * `relationship_type` deliberately excludes `'self'` here — a self-grant is only ever created by
 * `ConsentService.createSelfGrant()` during portal registration (`@ehr/portal`), never through this
 * staff-facing API (EHR_BUILD_SPEC.md §17).
 */
export const CreateProxyGrantSchema = z.object({
  portalAccountId: z.string().uuid(),
  relationshipType: z.enum(['parent', 'guardian', 'caregiver', 'other']),
  scope: z.array(z.string()).default([]),
  effectiveStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveStart must be YYYY-MM-DD')
    .nullish(),
  effectiveEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveEnd must be YYYY-MM-DD')
    .nullish(),
  authorityDocumentId: z.string().uuid().nullish(),
});
export type CreateProxyGrantInput = z.infer<typeof CreateProxyGrantSchema>;

export const RevokeProxyGrantSchema = z.object({
  reason: z.string().min(1).max(500).nullish(),
});
export type RevokeProxyGrantInput = z.infer<typeof RevokeProxyGrantSchema>;
