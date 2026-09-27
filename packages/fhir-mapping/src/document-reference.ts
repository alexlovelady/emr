import type { DocumentRow } from '@ehr/documents';

const STATUS_MAP: Record<string, string> = {
  pending_upload: 'preliminary',
  stored: 'current',
};

/**
 * EHR_BUILD_SPEC.md §8.1/§12: `/fhir/r4/DocumentReference?patient={id}`. Every other mapping in
 * this package is a pure, synchronous function — `DocumentRow.storageKey` is an object-storage
 * key, not a URL, and getting a real one requires the async, gateway-backed
 * `DocumentService.getDownloadUrl()` (`@ehr/documents`, needs an `ObjectStorageGateway` this app
 * doesn't wire up). To keep this mapping consistent with the rest of the package rather than
 * introducing the only async/gateway-dependent `toFhir*` function, `attachment.url` points at this
 * app's own document-download route instead of a presigned object-storage URL — a caller resolves
 * the actual bytes by following it, same as any other REST hyperlink.
 */
export function toFhirDocumentReference(row: DocumentRow, downloadUrlBase: string): Record<string, unknown> {
  return {
    resourceType: 'DocumentReference',
    id: row.id,
    meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-documentreference'] },
    status: STATUS_MAP[row.status] ?? 'current',
    ...(row.documentCategory
      ? { category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/document-classcodes', code: row.documentCategory }] }] }
      : {}),
    ...(row.patientId ? { subject: { reference: `Patient/${row.patientId}` } } : {}),
    ...(row.encounterId ? { context: { encounter: [{ reference: `Encounter/${row.encounterId}` }] } } : {}),
    date: row.createdAt.toISOString(),
    content: [
      {
        attachment: {
          contentType: row.contentType,
          title: row.filename,
          ...(row.sizeBytes !== null ? { size: row.sizeBytes } : {}),
          url: `${downloadUrlBase}/${row.id}`,
        },
      },
    ],
  };
}
