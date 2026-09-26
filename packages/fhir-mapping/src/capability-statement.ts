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
        ],
      },
    ],
  };
}
