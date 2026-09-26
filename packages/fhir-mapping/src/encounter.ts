import type { EncounterRow } from '@ehr/clinical';

const STATUS_MAP: Record<string, string> = {
  roomed: 'arrived',
  in_progress: 'in-progress',
  documentation: 'in-progress',
  signed: 'finished',
  coding_review: 'finished',
};

/** EHR_BUILD_SPEC.md §8.1: `/fhir/r4/Encounter?patient={id}`. */
export function toFhirEncounter(row: EncounterRow): Record<string, unknown> {
  return {
    resourceType: 'Encounter',
    id: row.id,
    status: STATUS_MAP[row.status] ?? 'unknown',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    type: [{ text: row.encounterType }],
    subject: { reference: `Patient/${row.patientId}` },
    period: {
      start: row.startedAt.toISOString(),
      ...(row.endedAt ? { end: row.endedAt.toISOString() } : {}),
    },
    ...(row.chiefComplaint ? { reasonCode: [{ text: row.chiefComplaint }] } : {}),
  };
}
