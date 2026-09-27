import { describe, expect, it } from 'vitest';
import type { AllergyRow } from '@ehr/clinical';
import { toFhirAllergyIntolerance } from './allergy-intolerance.js';

function buildRow(overrides: Partial<AllergyRow> = {}): AllergyRow {
  return {
    id: 'allergy-1',
    tenantId: 'tenant-1',
    patientId: 'patient-1',
    encounterId: null,
    substance: 'Penicillin',
    reaction: 'Hives',
    severity: 'moderate',
    onsetDate: null,
    notes: null,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    ...overrides,
  };
}

describe('toFhirAllergyIntolerance', () => {
  it('maps free-text substance to code.text, never a fabricated coding[]', () => {
    const fhir = toFhirAllergyIntolerance(buildRow());
    expect(fhir).toMatchObject({
      resourceType: 'AllergyIntolerance',
      id: 'allergy-1',
      clinicalStatus: { coding: [{ code: 'active' }] },
      code: { text: 'Penicillin' },
      patient: { reference: 'Patient/patient-1' },
      reaction: [{ manifestation: [{ text: 'Hives' }], severity: 'moderate' }],
    });
    expect((fhir.code as { coding?: unknown }).coding).toBeUndefined();
  });

  it('omits reaction entirely when there is no reaction/severity to map', () => {
    const fhir = toFhirAllergyIntolerance(buildRow({ reaction: null, severity: null }));
    expect(fhir).not.toHaveProperty('reaction');
  });
});
