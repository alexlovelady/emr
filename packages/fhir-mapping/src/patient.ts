import type { PatientRow } from '@ehr/patient';

/**
 * EHR_BUILD_SPEC.md §8.1/§12: a thin, real-but-partial US Core Patient mapping — enough fields
 * to be a valid, useful FHIR resource, not full US Core "must support" element coverage (no
 * race/ethnicity extensions, no multiple-identifier reconciliation). Pure function, no I/O.
 */
export function toFhirPatient(row: PatientRow): Record<string, unknown> {
  const telecom = buildTelecom(row);
  return {
    resourceType: 'Patient',
    id: row.id,
    meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'] },
    active: row.status === 'active',
    name: [
      {
        use: 'official',
        family: row.familyName,
        given: [row.givenName, ...(row.middleName ? [row.middleName] : [])],
      },
    ],
    ...(row.sexAtBirth || row.genderIdentity ? { gender: mapAdministrativeGender(row.sexAtBirth ?? row.genderIdentity ?? '') } : {}),
    birthDate: row.dateOfBirth,
    ...(telecom.length > 0 ? { telecom } : {}),
    ...(hasAddress(row) ? { address: [toFhirAddress(row)] } : {}),
  };
}

function buildTelecom(row: PatientRow): Array<{ system: string; value: string }> {
  const telecom: Array<{ system: string; value: string }> = [];
  if (row.phone) telecom.push({ system: 'phone', value: row.phone });
  if (row.email) telecom.push({ system: 'email', value: row.email });
  return telecom;
}

function mapAdministrativeGender(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'male' || normalized === 'm') return 'male';
  if (normalized === 'female' || normalized === 'f') return 'female';
  return 'unknown';
}

function hasAddress(row: PatientRow): boolean {
  return Boolean(row.addressLine1 || row.city || row.state || row.postalCode);
}

function toFhirAddress(row: PatientRow): Record<string, unknown> {
  return {
    line: [row.addressLine1, row.addressLine2].filter((v): v is string => Boolean(v)),
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    postalCode: row.postalCode ?? undefined,
    country: row.country ?? undefined,
  };
}
