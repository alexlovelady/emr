import { describe, expect, it } from 'vitest';
import type { DocumentRow } from '@ehr/documents';
import { toFhirDocumentReference } from './document-reference.js';

function buildRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'document-1',
    tenantId: 'tenant-1',
    filename: 'discharge-summary.pdf',
    contentType: 'application/pdf',
    sizeBytes: 2048,
    storageKey: 'tenant-1/documents/document-1.pdf',
    patientId: 'patient-1',
    encounterId: null,
    documentCategory: 'discharge_summary',
    status: 'stored',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    version: 1,
    ...overrides,
  };
}

describe('toFhirDocumentReference', () => {
  it('maps a stored document row to a valid US Core DocumentReference resource', () => {
    const fhir = toFhirDocumentReference(buildRow(), 'https://fhir.example.test/documents');
    expect(fhir).toMatchObject({
      resourceType: 'DocumentReference',
      id: 'document-1',
      status: 'current',
      subject: { reference: 'Patient/patient-1' },
      content: [{ attachment: { contentType: 'application/pdf', title: 'discharge-summary.pdf', size: 2048, url: 'https://fhir.example.test/documents/document-1' } }],
    });
  });

  it('maps a not-yet-uploaded document to a preliminary status', () => {
    const fhir = toFhirDocumentReference(buildRow({ status: 'pending_upload' }), 'https://fhir.example.test/documents');
    expect(fhir).toMatchObject({ status: 'preliminary' });
  });

  it('omits subject when the document has no patient association', () => {
    const fhir = toFhirDocumentReference(buildRow({ patientId: null }), 'https://fhir.example.test/documents');
    expect(fhir).not.toHaveProperty('subject');
  });
});
