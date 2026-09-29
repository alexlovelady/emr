import { createHash, randomUUID } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getConfig } from '@ehr/config';
import { withTenantContext } from '@ehr/db';
import { ForbiddenError, ValidationError } from '@ehr/domain-common';
import { setupTestDb, type TestDbHandle } from '@ehr/testing';
import { AuthorizeController } from './authorize.controller.js';

const REDIRECT_URI = 'https://example-smart-app.test/callback';

function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function fakeReply(): FastifyReply & { statusCode?: number; location?: string } {
  const reply = {
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    header(name: string, value: string) {
      if (name === 'Location') reply.location = value;
      return reply;
    },
  } as unknown as FastifyReply & { statusCode?: number; location?: string };
  return reply;
}

/**
 * Item 24 — `AuthorizeController`'s `launch`-param branch. Inserts `smart_launch_contexts` rows
 * directly (same reasoning `token.service.integration.test.ts` gives for inserting
 * `smart_authorization_codes` directly: proving the mechanism at the same layer that owns it,
 * without pulling apps/api in as a test-only dependency) and calls the controller directly rather
 * than booting a full HTTP server, mirroring how NestJS controllers with no framework magic in
 * their method bodies are already tested in this repo.
 */
describe('AuthorizeController — EHR launch (item 24)', () => {
  let handle: TestDbHandle;
  let controller: AuthorizeController;
  let patientId: string;
  let userId: string;
  let fhirBaseUrl: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const env = getConfig();
    controller = new AuthorizeController(handle.ownerDb, env);
    fhirBaseUrl = `http://localhost:${env.INTEROP_FHIR_PORT}/fhir/r4`;

    const ctxA = handle.seed.tenantA;
    patientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({ tenant_id: ctxA.tenantId, given_name: 'Ehr', family_name: `Launch-${Date.now()}`, date_of_birth: '1990-02-02', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });
    userId = ctxA.staffUserId;
  });

  afterAll(() => handle.close());

  async function insertLaunchContext(overrides: Partial<{ expiresAt: Date; consumedAt: Date; clientId: string }> = {}) {
    const ctxA = handle.seed.tenantA;
    const row = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      trx
        .insertInto('smart_launch_contexts')
        .values({
          tenant_id: ctxA.tenantId,
          client_id: overrides.clientId ?? ctxA.smartClientId,
          patient_id: patientId,
          user_id: userId,
          expires_at: overrides.expiresAt ?? new Date(Date.now() + 5 * 60_000),
          consumed_at: overrides.consumedAt ?? null,
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );
    return row.id;
  }

  function baseQuery(launch: string): Record<string, string> {
    return {
      response_type: 'code',
      client_id: handle.seed.tenantA.smartClientId,
      redirect_uri: REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: challengeFor('ehr-launch-verifier-1'),
      scope: 'launch patient/Patient.read',
      aud: fhirBaseUrl,
      launch,
      state: 'xyz-state',
    };
  }

  it('rejects a mismatched aud', async () => {
    const launch = await insertLaunchContext();
    await expect(controller.authorize({ ...baseQuery(launch), aud: 'https://wrong-server.test/fhir/r4' }, fakeReply())).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an unknown launch id', async () => {
    await expect(controller.authorize(baseQuery(randomUUID()), fakeReply())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects an expired launch context', async () => {
    const launch = await insertLaunchContext({ expiresAt: new Date(Date.now() - 60_000) });
    await expect(controller.authorize(baseQuery(launch), fakeReply())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a scope the client is not allowed', async () => {
    const launch = await insertLaunchContext();
    await expect(controller.authorize({ ...baseQuery(launch), scope: 'launch patient/MedicationRequest.write' }, fakeReply())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('resolves a valid EHR launch directly into an authorization code and redirects, skipping the patient-portal consent UI', async () => {
    const launch = await insertLaunchContext();
    const reply = fakeReply();
    await controller.authorize(baseQuery(launch), reply);

    expect(reply.statusCode).toBe(302);
    expect(reply.location).toBeDefined();
    const redirectUrl = new URL(reply.location!);
    expect(redirectUrl.origin + redirectUrl.pathname).toBe(REDIRECT_URI);
    expect(redirectUrl.searchParams.get('state')).toBe('xyz-state');
    const code = redirectUrl.searchParams.get('code');
    expect(code).toBeTruthy();

    const codeRow = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      trx.selectFrom('smart_authorization_codes').selectAll().where('id', '=', code!).executeTakeFirstOrThrow(),
    );
    expect(codeRow.patient_id).toBe(patientId);
    expect(codeRow.portal_account_id).toBeNull();
    expect(codeRow.launched_by_user_id).toBe(userId);
    expect(codeRow.status).toBe('issued');

    const contextRow = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      trx.selectFrom('smart_launch_contexts').selectAll().where('id', '=', launch).executeTakeFirstOrThrow(),
    );
    expect(contextRow.consumed_at).not.toBeNull();
  });

  it('rejects replaying an already-consumed launch id (single-use, no replay)', async () => {
    const launch = await insertLaunchContext();
    await controller.authorize(baseQuery(launch), fakeReply());
    await expect(controller.authorize(baseQuery(launch), fakeReply())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('carries encounter context through to the minted code when the launch included one', async () => {
    const ctxA = handle.seed.tenantA;
    const encounterId = await withTenantContext(handle.ownerDb, ctxA.tenantId, async (trx) => {
      const workforceIdentity = await trx
        .insertInto('workforce_identities')
        .values({ tenant_id: ctxA.tenantId, user_id: userId, organization_id: ctxA.organizationId, status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const practitioner = await trx
        .insertInto('practitioners')
        .values({ tenant_id: ctxA.tenantId, workforce_identity_id: workforceIdentity.id, display_name: 'Dr. Launch Test', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const appointment = await trx
        .insertInto('appointments')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: patientId,
          location_id: ctxA.locationId,
          practitioner_id: practitioner.id,
          appointment_type: 'office_visit',
          scheduled_start: new Date(Date.now() + 3600_000),
          scheduled_end: new Date(Date.now() + 7200_000),
          status: 'checked_in',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const encounter = await trx
        .insertInto('encounters')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: patientId,
          appointment_id: appointment.id,
          location_id: ctxA.locationId,
          practitioner_id: practitioner.id,
          encounter_type: 'office_visit',
          status: 'roomed',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return encounter.id;
    });

    const launch = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      trx
        .insertInto('smart_launch_contexts')
        .values({
          tenant_id: ctxA.tenantId,
          client_id: ctxA.smartClientId,
          patient_id: patientId,
          encounter_id: encounterId,
          user_id: userId,
          expires_at: new Date(Date.now() + 5 * 60_000),
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    ).then((r) => r.id);

    const reply = fakeReply();
    await controller.authorize(baseQuery(launch), reply);
    const code = new URL(reply.location!).searchParams.get('code')!;
    const codeRow = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      trx.selectFrom('smart_authorization_codes').select('encounter_id').where('id', '=', code).executeTakeFirstOrThrow(),
    );
    expect(codeRow.encounter_id).toBe(encounterId);
  });
});
