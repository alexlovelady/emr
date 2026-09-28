import { z } from 'zod';

export const CreateCoverageSchema = z
  .object({
    payerName: z.string().min(1).max(300),
    memberId: z.string().min(1).max(200),
    groupNumber: z.string().max(200).nullish(),
    planName: z.string().max(300).nullish(),
    coverageType: z.enum(['primary', 'secondary', 'tertiary']).default('primary'),
    effectiveStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveStart must be YYYY-MM-DD'),
    effectiveEnd: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish(),
    /** The patient is the subscriber (policyholder) unless this says otherwise — e.g. a child
     * covered under a parent's plan. Defaults to 'self', the common case. */
    subscriberRelationship: z.enum(['self', 'spouse', 'child', 'other']).default('self'),
    /** Required whenever `subscriberRelationship` isn't 'self' — a claim scrubber flags a
     * non-self relationship with no subscriber name as a real subscriber-mismatch risk. */
    subscriberName: z.string().max(300).nullish(),
  })
  .refine((v) => v.subscriberRelationship === 'self' || !!v.subscriberName, {
    message: 'subscriberName is required when subscriberRelationship is not "self"',
    path: ['subscriberName'],
  });
export type CreateCoverageInput = z.infer<typeof CreateCoverageSchema>;
