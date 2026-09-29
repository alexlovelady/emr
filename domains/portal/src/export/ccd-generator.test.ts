import { describe, expect, it } from 'vitest';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { PatientRow } from '@ehr/patient';
import type { ProblemRow, AllergyRow } from '@ehr/clinical';
import type { MedicationRow } from '@ehr/medication';
import type { DiagnosticReportRow } from '@ehr/results';
import { generateCcdXml } from './ccd-generator.js';

function buildPatient(overrides: Partial<PatientRow> = {}): PatientRow {
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
    addressLine1: '123 Main St',
    addressLine2: null,
    city: 'Springfield',
    state: 'IL',
    postalCode: '62701',
    country: 'US',
    preferredLanguage: 'en-US',
    status: 'active',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    ...overrides,
  };
}

function buildProblem(overrides: Partial<ProblemRow> = {}): ProblemRow {
  return {
    id: 'problem-1',
    tenantId: 'tenant-1',
    patientId: 'patient-1',
    encounterId: null,
    codeSystem: 'ICD-10-CM',
    code: 'E11.9',
    displayName: 'Type 2 diabetes mellitus without complications',
    clinicalStatus: 'active',
    onsetDate: '2020-01-15',
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

function buildAllergy(overrides: Partial<AllergyRow> = {}): AllergyRow {
  return {
    id: 'allergy-1',
    tenantId: 'tenant-1',
    patientId: 'patient-1',
    encounterId: null,
    substance: 'Penicillin',
    codeSystem: null,
    code: null,
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

function buildMedication(overrides: Partial<MedicationRow> = {}): MedicationRow {
  return {
    id: 'medication-1',
    tenantId: 'tenant-1',
    patientId: 'patient-1',
    encounterId: null,
    medicationName: 'Metformin',
    rxnormCode: '861007',
    dose: '500mg',
    route: 'oral',
    frequency: 'twice daily',
    sourceType: 'prescribed',
    startedAt: '2020-01-15',
    stoppedAt: null,
    prescriberId: null,
    notes: null,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    ...overrides,
  };
}

function buildResult(overrides: Partial<DiagnosticReportRow> = {}): DiagnosticReportRow {
  return {
    id: 'result-1',
    tenantId: 'tenant-1',
    orderId: null,
    patientId: 'patient-1',
    encounterId: 'encounter-1',
    codeSystem: 'LOINC',
    code: '4548-4',
    displayName: 'Hemoglobin A1c',
    conclusion: '7.1%',
    performingLab: 'Quest',
    issuedAt: new Date('2024-03-01T12:00:00Z'),
    criticalFlag: false,
    abnormalFlag: false,
    reviewStatus: 'reviewed',
    reviewedAt: new Date(),
    reviewedBy: null,
    amendsReportId: null,
    status: 'final',
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    ...overrides,
  };
}

describe('generateCcdXml', () => {
  it('produces well-formed XML', () => {
    const xml = generateCcdXml({
      generatedAt: new Date('2024-03-05T10:00:00Z'),
      custodianName: 'Test Clinic',
      patient: buildPatient(),
      problems: [buildProblem()],
      allergies: [buildAllergy()],
      medications: [buildMedication()],
      results: [buildResult()],
    });
    expect(XMLValidator.validate(xml)).toBe(true);
  });

  it('carries the standard CCD document templateId and LOINC document code', () => {
    const xml = generateCcdXml({
      generatedAt: new Date(),
      custodianName: 'Test Clinic',
      patient: buildPatient(),
      problems: [],
      allergies: [],
      medications: [],
      results: [],
    });
    expect(xml).toContain('templateId root="2.16.840.1.113883.10.20.22.1.2"');
    expect(xml).toContain('code code="34133-9"');
  });

  it('embeds real patient demographics', () => {
    const xml = generateCcdXml({
      generatedAt: new Date(),
      custodianName: 'Test Clinic',
      patient: buildPatient({ givenName: 'Alexandra', familyName: 'Nguyen' }),
      problems: [],
      allergies: [],
      medications: [],
      results: [],
    });
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
    const patientEl = parsed.ClinicalDocument.recordTarget.patientRole.patient;
    expect(patientEl.name.given).toBe('Alexandra');
    expect(patientEl.name.family).toBe('Nguyen');
  });

  it('maps a recognized code system (ICD-10-CM) to its real HL7 OID', () => {
    const xml = generateCcdXml({
      generatedAt: new Date(),
      custodianName: 'Test Clinic',
      patient: buildPatient(),
      problems: [buildProblem({ code: 'E11.9', codeSystem: 'ICD-10-CM' })],
      allergies: [],
      medications: [],
      results: [],
    });
    expect(xml).toContain('codeSystem="2.16.840.1.113883.6.90"');
  });

  it('falls back to nullFlavor="OTH" for an unrecognized code system, instead of fabricating an OID', () => {
    const xml = generateCcdXml({
      generatedAt: new Date(),
      custodianName: 'Test Clinic',
      patient: buildPatient(),
      problems: [buildProblem({ code: 'X123', codeSystem: 'SomeLocalCodeSystem' })],
      allergies: [],
      medications: [],
      results: [],
    });
    expect(xml).toContain('nullFlavor="OTH"');
    expect(xml).toContain('SomeLocalCodeSystem');
  });

  it('has no immunizations section (no immunization domain exists in this repo)', () => {
    const xml = generateCcdXml({
      generatedAt: new Date(),
      custodianName: 'Test Clinic',
      patient: buildPatient(),
      problems: [],
      allergies: [],
      medications: [],
      results: [],
    });
    // The real Immunization Section templateId per the C-CDA IG.
    expect(xml).not.toContain('2.16.840.1.113883.10.20.22.2.2');
  });

  it('renders an empty-state narrative for a section with no data, rather than an empty table', () => {
    const xml = generateCcdXml({
      generatedAt: new Date(),
      custodianName: 'Test Clinic',
      patient: buildPatient(),
      problems: [],
      allergies: [buildAllergy()],
      medications: [],
      results: [],
    });
    expect(xml).toContain('No known problems recorded.');
    expect(xml).toContain('Penicillin');
  });
});
