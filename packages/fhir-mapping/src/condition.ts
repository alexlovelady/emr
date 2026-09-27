import type { ProblemRow } from '@ehr/clinical';

const CLINICAL_STATUS_MAP: Record<string, string> = {
  active: 'active',
  resolved: 'resolved',
  inactive: 'inactive',
};

/** EHR_BUILD_SPEC.md §8.1/§12: `/fhir/r4/Condition?patient={id}`, mapped from `domains/clinical`'s
 * Problem (always coded — `codeSystem`/`code` are non-null columns, unlike Allergy's free text). */
export function toFhirCondition(row: ProblemRow): Record<string, unknown> {
  return {
    resourceType: 'Condition',
    id: row.id,
    meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns'] },
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: CLINICAL_STATUS_MAP[row.clinicalStatus] ?? 'unknown',
        },
      ],
    },
    category: [
      {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item' }],
      },
    ],
    code: { coding: [{ system: row.codeSystem, code: row.code, display: row.displayName }], text: row.displayName },
    subject: { reference: `Patient/${row.patientId}` },
    ...(row.encounterId ? { encounter: { reference: `Encounter/${row.encounterId}` } } : {}),
    ...(row.onsetDate ? { onsetDateTime: row.onsetDate } : {}),
  };
}
