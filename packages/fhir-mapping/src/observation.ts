import type { ObservationRow } from '@ehr/clinical';

const STATUS_MAP: Record<string, string> = {
  final: 'final',
  preliminary: 'preliminary',
  corrected: 'corrected',
  amended: 'amended',
  cancelled: 'cancelled',
  entered_in_error: 'entered-in-error',
};

/** EHR_BUILD_SPEC.md §8.1: `/fhir/r4/Observation?patient={id}&category=laboratory`. */
export function toFhirObservation(row: ObservationRow): Record<string, unknown> {
  return {
    resourceType: 'Observation',
    id: row.id,
    status: STATUS_MAP[row.status] ?? 'unknown',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: row.category,
          },
        ],
      },
    ],
    code: { coding: [{ code: row.code, display: row.displayName }], text: row.displayName },
    subject: { reference: `Patient/${row.patientId}` },
    encounter: { reference: `Encounter/${row.encounterId}` },
    effectiveDateTime: row.effectiveAt.toISOString(),
    ...(row.valueQuantity !== null
      ? { valueQuantity: { value: Number(row.valueQuantity), unit: row.unit ?? undefined } }
      : row.valueText !== null
        ? { valueString: row.valueText }
        : {}),
  };
}
