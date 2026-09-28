import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '@ehr/domain-common';
import { assertPatientInLaunchContext } from './require-fhir-context.js';
import type { FhirRequestContext } from '../common/fastify-request.js';

const BASE_CTX: FhirRequestContext = { tenantId: 't1', clientId: 'c1', scope: ['patient/Patient.read'] };

describe('assertPatientInLaunchContext', () => {
  it('allows a client_credentials token (no patientId claim) to act on any patient', () => {
    expect(() => assertPatientInLaunchContext(BASE_CTX, 'some-other-patient')).not.toThrow();
  });

  it('allows a launch-context token to act on its own patient', () => {
    const ctx = { ...BASE_CTX, patientId: 'p1' };
    expect(() => assertPatientInLaunchContext(ctx, 'p1')).not.toThrow();
  });

  it('rejects a launch-context token acting on a different patient', () => {
    const ctx = { ...BASE_CTX, patientId: 'p1' };
    expect(() => assertPatientInLaunchContext(ctx, 'p2')).toThrow(ForbiddenError);
  });
});
