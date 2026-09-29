import { describe, expect, it } from 'vitest';
import type { ProblemRow } from '@ehr/clinical';
import { toFhirCondition } from './condition.js';

function buildRow(overrides: Partial<ProblemRow> = {}): ProblemRow {
  return {
    id: 'problem-1',
    tenantId: 'tenant-1',
    patientId: 'patient-1',
    encounterId: null,
    codeSystem: 'ICD-10-CM',
    code: 'E11.9',
    displayName: 'Type 2 diabetes mellitus without complications',
    clinicalStatus: 'active',
    onsetDate: '2024-01-15',
    notes: null,
    sensitivity: null,
    status: 'active',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    ...overrides,
  };
}

describe('toFhirCondition', () => {
  it('maps a problem row to a valid US Core Condition resource', () => {
    const fhir = toFhirCondition(buildRow());
    expect(fhir).toMatchObject({
      resourceType: 'Condition',
      id: 'problem-1',
      clinicalStatus: { coding: [{ code: 'active' }] },
      code: { coding: [{ system: 'ICD-10-CM', code: 'E11.9' }], text: 'Type 2 diabetes mellitus without complications' },
      subject: { reference: 'Patient/patient-1' },
      onsetDateTime: '2024-01-15',
    });
    expect(fhir).not.toHaveProperty('encounter');
  });

  it('includes an encounter reference when present', () => {
    const fhir = toFhirCondition(buildRow({ encounterId: 'encounter-1' }));
    expect(fhir).toMatchObject({ encounter: { reference: 'Encounter/encounter-1' } });
  });
});
