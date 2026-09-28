/**
 * EHR_BUILD_SPEC.md §8.1: "CapabilityStatement generated from deployed capability." Generated
 * here means "reflects exactly what apps/interop-fhir actually implements" rather than a static
 * aspirational document — update this alongside FhirController, not independently of it.
 */
export function buildCapabilityStatement(fhirBaseUrl: string): Record<string, unknown> {
  return {
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString(),
    kind: 'instance',
    fhirVersion: '4.0.1',
    format: ['json'],
    implementation: { url: fhirBaseUrl },
    rest: [
      {
        mode: 'server',
        security: {
          service: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/restful-security-service', code: 'SMART-on-FHIR' }] }],
          extension: [
            {
              url: 'http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris',
              extension: [{ url: 'token', valueUri: `${fhirBaseUrl}/token` }],
            },
          ],
        },
        /** System-level bulk export (HL7 Bulk Data Access IG) — see `BulkExportController`. */
        extension: [
          {
            url: 'http://hl7.org/fhir/uv/bulkdata/StructureDefinition/capabilities',
            valueCode: 'system-export',
          },
        ],
        operation: [{ name: 'export', definition: 'http://hl7.org/fhir/uv/bulkdata/OperationDefinition/export' }],
        resource: [
          {
            type: 'Patient',
            profile: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
            interaction: [{ code: 'read' }],
          },
          {
            type: 'Observation',
            profile: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab',
            interaction: [{ code: 'search-type' }],
            searchParam: [{ name: 'patient', type: 'reference' }, { name: 'category', type: 'token' }],
          },
          {
            type: 'Encounter',
            profile: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-encounter',
            interaction: [{ code: 'search-type' }],
            searchParam: [{ name: 'patient', type: 'reference' }],
          },
          {
            type: 'Condition',
            profile: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns',
            interaction: [{ code: 'search-type' }],
            searchParam: [{ name: 'patient', type: 'reference' }],
          },
          {
            type: 'AllergyIntolerance',
            profile: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-allergyintolerance',
            interaction: [{ code: 'search-type' }],
            searchParam: [{ name: 'patient', type: 'reference' }],
          },
          {
            type: 'MedicationRequest',
            profile: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest',
            interaction: [{ code: 'search-type' }],
            searchParam: [{ name: 'patient', type: 'reference' }],
          },
          {
            type: 'DocumentReference',
            profile: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-documentreference',
            interaction: [{ code: 'search-type' }],
            searchParam: [{ name: 'patient', type: 'reference' }],
          },
        ],
      },
    ],
  };
}
