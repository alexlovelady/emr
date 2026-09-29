import { describe, expect, it } from 'vitest';
import type { PatientRow } from '@ehr/patient';
import { generateRecordsPdf } from './pdf-generator.js';

function buildPatient(): PatientRow {
  return {
    id: 'patient-1',
    tenantId: 'tenant-1',
    givenName: 'Jane',
    middleName: null,
    familyName: 'Doe',
    dateOfBirth: '1980-05-15',
    sexAtBirth: 'female',
    genderIdentity: null,
    phone: '555-0100',
    email: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    preferredLanguage: null,
    status: 'active',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
  };
}

describe('generateRecordsPdf', () => {
  it('produces a real PDF file (correct magic bytes), not a placeholder', async () => {
    const buffer = await generateRecordsPdf({
      generatedAt: new Date(),
      patient: buildPatient(),
      problems: [],
      allergies: [],
      medications: [],
      notes: [],
      results: [],
    });
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('handles an empty record set without throwing', async () => {
    await expect(
      generateRecordsPdf({ generatedAt: new Date(), patient: buildPatient(), problems: [], allergies: [], medications: [], notes: [], results: [] }),
    ).resolves.toBeInstanceOf(Buffer);
  });
});
