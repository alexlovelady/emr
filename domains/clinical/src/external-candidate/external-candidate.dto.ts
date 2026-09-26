import { z } from 'zod';

const ProblemPayloadSchema = z.object({
  codeSystem: z.string().min(1).max(50),
  code: z.string().min(1).max(50),
  displayName: z.string().min(1).max(300),
  onsetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  notes: z.string().max(2000).nullish(),
});

const AllergyPayloadSchema = z.object({
  substance: z.string().min(1).max(300),
  reaction: z.string().max(500).nullish(),
  severity: z.enum(['mild', 'moderate', 'severe']).nullish(),
  onsetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  notes: z.string().max(2000).nullish(),
});

const MedicationPayloadSchema = z.object({
  medicationName: z.string().min(1).max(300),
  rxnormCode: z.string().max(50).nullish(),
  dose: z.string().max(100).nullish(),
  route: z.string().max(100).nullish(),
  frequency: z.string().max(100).nullish(),
  startedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  notes: z.string().max(2000).nullish(),
});

const ExternalCandidateItemSchema = z.discriminatedUnion('resourceType', [
  z.object({ resourceType: z.literal('problem'), payload: ProblemPayloadSchema }),
  z.object({ resourceType: z.literal('allergy'), payload: AllergyPayloadSchema }),
  z.object({ resourceType: z.literal('medication'), payload: MedicationPayloadSchema }),
]);

/**
 * EHR_BUILD_SPEC.md §11.3: incoming C-CDA/FHIR/HL7 clinical items become `external_candidate`
 * records. This accepts a pre-structured JSON payload (as if an XML-to-JSON extraction step
 * already ran) rather than parsing real C-CDA XML — see domains/clinical's README/plan doc for
 * why that front end is deferred; the reconciliation workflow itself (this module) is real.
 */
export const ImportExternalCandidatesSchema = z.object({
  originType: z.enum(['c-cda', 'fhir', 'hl7']),
  sourceDocumentId: z.string().min(1).max(200),
  items: z.array(ExternalCandidateItemSchema).min(1),
});
export type ImportExternalCandidatesInput = z.infer<typeof ImportExternalCandidatesSchema>;

export const ReplaceExternalCandidateSchema = z.object({
  targetResourceId: z.string().uuid(),
});
export type ReplaceExternalCandidateInput = z.infer<typeof ReplaceExternalCandidateSchema>;
