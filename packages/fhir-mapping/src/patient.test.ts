import { describe, expect, it } from 'vitest';
import type { PatientRow } from '@ehr/patient';
import { toFhirPatient } from './patient.js';

function buildRow(overrides: Partial<PatientRow> = {}): PatientRow {
  return {
    id: 'patient-1',
    tenantId: 'tenant-1',
    givenName: 'Jane',
    familyName: 'Doe',
    middleName: null,
    dateOfBirth: '1990-02-14',
    sexAtBirth: 'female',
    genderIdentity: null,
    phone: '555-0100',
    email: 'jane@example.test',
    addressLine1: '123 Main St',
    addressLine2: null,
    city: 'Springfield',
    state: 'IL',
    postalCode: '62704',
    country: 'US',
    preferredLanguage: null,
    status: 'active',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    ...overrides,
  };
}

describe('toFhirPatient', () => {
  it('maps a patient row to a valid US Core Patient resource', () => {
    const fhir = toFhirPatient(buildRow());
    expect(fhir).toMatchObject({
      resourceType: 'Patient',
      id: 'patient-1',
      active: true,
      gender: 'female',
      birthDate: '1990-02-14',
      name: [{ family: 'Doe', given: ['Jane'] }],
      telecom: [
        { system: 'phone', value: '555-0100' },
        { system: 'email', value: 'jane@example.test' },
      ],
      address: [{ city: 'Springfield', state: 'IL', postalCode: '62704' }],
    });
  });

  it('omits telecom/address when there is nothing to map', () => {
    const fhir = toFhirPatient(buildRow({ phone: null, email: null, addressLine1: null, city: null, state: null, postalCode: null }));
    expect(fhir).not.toHaveProperty('telecom');
    expect(fhir).not.toHaveProperty('address');
  });
});
