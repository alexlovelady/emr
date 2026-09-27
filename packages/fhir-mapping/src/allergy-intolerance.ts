import type { AllergyRow } from '@ehr/clinical';

const CLINICAL_STATUS_MAP: Record<string, string> = {
  active: 'active',
  inactive: 'inactive',
  resolved: 'resolved',
};

const SEVERITY_MAP: Record<string, string> = {
  mild: 'mild',
  moderate: 'moderate',
  severe: 'severe',
};

/**
 * EHR_BUILD_SPEC.md §8.1/§12: `/fhir/r4/AllergyIntolerance?patient={id}`. `domains/clinical`'s
 * Allergy is pure free text today (`substance: string`, no `codeSystem`/`code` columns) — `code`
 * is therefore `{text: row.substance}` only, with no `coding[]` array, honestly reflecting that no
 * coded allergy data exists yet rather than fabricating a system/code.
 */
export function toFhirAllergyIntolerance(row: AllergyRow): Record<string, unknown> {
  return {
    resourceType: 'AllergyIntolerance',
    id: row.id,
    meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-allergyintolerance'] },
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
          code: CLINICAL_STATUS_MAP[row.status] ?? 'active',
        },
      ],
    },
    code: { text: row.substance },
    patient: { reference: `Patient/${row.patientId}` },
    ...(row.encounterId ? { encounter: { reference: `Encounter/${row.encounterId}` } } : {}),
    ...(row.onsetDate ? { onsetDateTime: row.onsetDate } : {}),
    ...(row.reaction || row.severity
      ? {
          reaction: [
            {
              ...(row.reaction ? { manifestation: [{ text: row.reaction }] } : {}),
              ...(row.severity && SEVERITY_MAP[row.severity] ? { severity: SEVERITY_MAP[row.severity] } : {}),
            },
          ],
        }
      : {}),
  };
}
