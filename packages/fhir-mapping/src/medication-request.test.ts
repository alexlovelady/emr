import { describe, expect, it } from 'vitest';
import type { PrescriptionRow, MedicationRow } from '@ehr/medication';
import { toFhirMedicationRequest } from './medication-request.js';

function buildPrescription(overrides: Partial<PrescriptionRow> = {}): PrescriptionRow {
  return {
    id: 'prescription-1',
    tenantId: 'tenant-1',
    patientId: 'patient-1',
    medicationId: 'medication-1',
    encounterId: 'encounter-1',
    prescriberId: 'practitioner-1',
    pharmacyNcpdpId: '1234567',
    pharmacyName: 'Corner Pharmacy',
    quantity: '30',
    daysSupply: 30,
    refillsAuthorized: 3,
    refillsRemaining: 3,
    directions: 'Take one tablet by mouth daily',
    isControlledSubstance: false,
    deaSchedule: null,
    gatewayReferenceId: null,
    sentAt: null,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    version: 1,
    ...overrides,
  };
}

function buildMedication(overrides: Partial<MedicationRow> = {}): MedicationRow {
  return {
    id: 'medication-1',
    tenantId: 'tenant-1',
    patientId: 'patient-1',
    encounterId: 'encounter-1',
    medicationName: 'Lisinopril 10mg',
    rxnormCode: '314076',
    dose: '10mg',
    route: 'oral',
    frequency: 'once daily',
    sourceType: 'prescribed',
    startedAt: '2026-01-01',
    stoppedAt: null,
    prescriberId: 'practitioner-1',
    notes: null,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    ...overrides,
  };
}

describe('toFhirMedicationRequest', () => {
  it('maps prescription + medication rows to a valid US Core MedicationRequest resource', () => {
    const fhir = toFhirMedicationRequest(buildPrescription(), buildMedication());
    expect(fhir).toMatchObject({
      resourceType: 'MedicationRequest',
      id: 'prescription-1',
      status: 'active',
      intent: 'order',
      medicationCodeableConcept: {
        coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '314076' }],
        text: 'Lisinopril 10mg',
      },
      subject: { reference: 'Patient/patient-1' },
      encounter: { reference: 'Encounter/encounter-1' },
      requester: { reference: 'Practitioner/practitioner-1' },
      dosageInstruction: [{ text: 'Take one tablet by mouth daily' }],
    });
  });

  it('maps a rejected prescription to a stopped status', () => {
    const fhir = toFhirMedicationRequest(buildPrescription({ status: 'rejected' }), buildMedication());
    expect(fhir).toMatchObject({ status: 'stopped' });
  });
});
