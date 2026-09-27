import type { PrescriptionRow, MedicationRow } from '@ehr/medication';

const STATUS_MAP: Record<string, string> = {
  active: 'active',
  rejected: 'stopped',
  cancelled: 'cancelled',
  completed: 'completed',
  entered_in_error: 'entered-in-error',
};

/**
 * EHR_BUILD_SPEC.md §8.1/§12: `/fhir/r4/MedicationRequest?patient={id}`. `PrescriptionRow` alone
 * doesn't carry the medication code/dose/route/frequency — those live on the separate
 * `MedicationRow` it references via `medicationId` — so this mapping, unlike every other one in
 * this package, needs both rows from its caller.
 */
export function toFhirMedicationRequest(prescription: PrescriptionRow, medication: MedicationRow): Record<string, unknown> {
  return {
    resourceType: 'MedicationRequest',
    id: prescription.id,
    meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest'] },
    status: STATUS_MAP[prescription.status] ?? 'unknown',
    intent: 'order',
    medicationCodeableConcept: {
      ...(medication.rxnormCode
        ? { coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: medication.rxnormCode, display: medication.medicationName }] }
        : {}),
      text: medication.medicationName,
    },
    subject: { reference: `Patient/${prescription.patientId}` },
    ...(prescription.encounterId ? { encounter: { reference: `Encounter/${prescription.encounterId}` } } : {}),
    requester: { reference: `Practitioner/${prescription.prescriberId}` },
    authoredOn: prescription.createdAt.toISOString(),
    dosageInstruction: [
      {
        text: prescription.directions,
        ...(medication.route ? { route: { text: medication.route } } : {}),
        ...(medication.frequency ? { timing: { code: { text: medication.frequency } } } : {}),
      },
    ],
    dispenseRequest: {
      quantity: { value: Number(prescription.quantity) || undefined, text: prescription.quantity },
      ...(prescription.daysSupply !== null ? { expectedSupplyDuration: { value: prescription.daysSupply, unit: 'days' } } : {}),
      numberOfRepeatsAllowed: prescription.refillsAuthorized,
    },
  };
}
