import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import { Pool } from 'pg';
import { seedSyntheticFixtures, withTenantContext, type SeedResult, type DB } from '@ehr/db';
import { resourceRelationshipLayer } from './resource-relationship.layer.js';
import { purposeSensitivityLayer } from './purpose-sensitivity.layer.js';
import { breakGlassLayer } from './break-glass.layer.js';
import { PolicyEngine, DEFAULT_LAYERS } from '../policy-engine.js';
import { BreakglassGrantRepository } from '../breakglass/breakglass.repository.js';
import type { AuthzContext } from '../context.js';
import type { PolicyLayer } from '../policy-layer.js';

/**
 * Item 22's real layers (4, 5, 8) — requires a live Postgres reachable via DATABASE_URL/
 * APP_DATABASE_URL with migrations already applied. Run via `pnpm test:integration`, same
 * conventions as db-layers.integration.test.ts (which this deliberately doesn't merge into, since
 * these three layers need a much larger fixture graph: practitioners, encounters, appointments,
 * problems, and breakglass grants).
 */
describe('resource-relationship / purpose-sensitivity / break-glass layers (integration)', () => {
  let ownerDb: Kysely<DB>;
  let appDb: Kysely<DB>;
  let seed: SeedResult;
  const breakglassRepo = new BreakglassGrantRepository();

  beforeAll(async () => {
    ownerDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) }) });
    seed = await seedSyntheticFixtures(ownerDb);
    appDb = new Kysely<DB>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.APP_DATABASE_URL }) }) });
  });

  afterAll(async () => {
    await ownerDb.destroy();
    await appDb.destroy();
  });

  function ctxFor(overrides: Partial<AuthzContext> = {}): AuthzContext {
    return { tenantId: seed.tenantA.tenantId, actor: { id: seed.tenantA.adminUserId, type: 'user' }, action: 'x', requestId: 'r1', ...overrides };
  }

  function evalLayer(layer: PolicyLayer, ctx: AuthzContext) {
    return withTenantContext(appDb, ctx.tenantId, (trx: Transaction<DB>) => layer.evaluate(ctx, trx));
  }

  async function createPatient(): Promise<string> {
    const patient = await withTenantContext(ownerDb, seed.tenantA.tenantId, (trx) =>
      trx
        .insertInto('patients')
        .values({ tenant_id: seed.tenantA.tenantId, given_name: 'Authz', family_name: `Layer4-${randomUUID()}`, date_of_birth: '1990-01-01', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );
    return patient.id;
  }

  async function createPractitionerForUser(userId: string): Promise<string> {
    return withTenantContext(ownerDb, seed.tenantA.tenantId, async (trx) => {
      const workforceIdentity = await trx
        .insertInto('workforce_identities')
        .values({ tenant_id: seed.tenantA.tenantId, user_id: userId, organization_id: seed.tenantA.organizationId, status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const practitioner = await trx
        .insertInto('practitioners')
        .values({ tenant_id: seed.tenantA.tenantId, workforce_identity_id: workforceIdentity.id, display_name: 'Dr. Authz Test', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      return practitioner.id;
    });
  }

  async function createEncounter(patientId: string, practitionerId: string): Promise<string> {
    return withTenantContext(ownerDb, seed.tenantA.tenantId, async (trx) => {
      const appointment = await trx
        .insertInto('appointments')
        .values({
          tenant_id: seed.tenantA.tenantId,
          patient_id: patientId,
          location_id: seed.tenantA.locationId,
          practitioner_id: practitionerId,
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
          tenant_id: seed.tenantA.tenantId,
          patient_id: patientId,
          appointment_id: appointment.id,
          location_id: seed.tenantA.locationId,
          practitioner_id: practitionerId,
          encounter_type: 'office_visit',
          status: 'roomed',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return encounter.id;
    });
  }

  async function createProblem(patientId: string, sensitivity: string | null): Promise<string> {
    const problem = await withTenantContext(ownerDb, seed.tenantA.tenantId, (trx) =>
      trx
        .insertInto('problems')
        .values({
          tenant_id: seed.tenantA.tenantId,
          patient_id: patientId,
          code_system: 'ICD-10',
          code: 'Z00.00',
          display_name: 'Test problem',
          status: 'active',
          sensitivity,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );
    return problem.id;
  }

  describe('resourceRelationshipLayer', () => {
    it('abstains (NOT_APPLICABLE) for the ordinary patient.read.clinical permission — zero effect on existing roles', async () => {
      const patientId = await createPatient();
      const ctx = ctxFor({ action: 'patient.read.clinical', resource: { type: 'patient', id: patientId } });
      expect(await evalLayer(resourceRelationshipLayer, ctx)).toBe('NOT_APPLICABLE');
    });

    it('denies the scoped permission when the practitioner has no encounter/appointment relationship with the patient', async () => {
      const patientId = await createPatient();
      const practitionerId = await createPractitionerForUser(seed.tenantA.adminUserId);
      void practitionerId; // a practitioner record exists for this user, but no encounter/appointment ties it to this specific patient
      const ctx = ctxFor({ action: 'patient.read.care_team_scoped', resource: { type: 'patient', id: patientId } });
      expect(await evalLayer(resourceRelationshipLayer, ctx)).toBe('DENY');
    });

    it('abstains (allows the underlying grant to stand) once a real encounter relationship exists', async () => {
      const patientId = await createPatient();
      const practitionerId = await createPractitionerForUser(seed.tenantA.staffUserId);
      await createEncounter(patientId, practitionerId);
      const ctx = ctxFor({
        actor: { id: seed.tenantA.staffUserId, type: 'user' },
        action: 'patient.read.care_team_scoped',
        resource: { type: 'patient', id: patientId },
      });
      expect(await evalLayer(resourceRelationshipLayer, ctx)).toBe('NOT_APPLICABLE');
    });
  });

  describe('purposeSensitivityLayer', () => {
    it('abstains for a non-sensitive problem even with a payment purpose', async () => {
      const patientId = await createPatient();
      const problemId = await createProblem(patientId, null);
      const ctx = ctxFor({ action: 'problem.manage', resource: { type: 'problem', id: problemId }, purpose: 'payment' });
      expect(await evalLayer(purposeSensitivityLayer, ctx)).toBe('NOT_APPLICABLE');
    });

    it('denies access to a sensitive problem for an explicit non-treatment purpose', async () => {
      const patientId = await createPatient();
      const problemId = await createProblem(patientId, 'behavioral_health');
      const ctx = ctxFor({ action: 'problem.manage', resource: { type: 'problem', id: problemId }, purpose: 'payment' });
      expect(await evalLayer(purposeSensitivityLayer, ctx)).toBe('DENY');
    });

    it('abstains for a sensitive problem when the purpose is treatment (the default)', async () => {
      const patientId = await createPatient();
      const problemId = await createProblem(patientId, 'substance_use');
      const ctx = ctxFor({ action: 'problem.manage', resource: { type: 'problem', id: problemId } });
      expect(await evalLayer(purposeSensitivityLayer, ctx)).toBe('NOT_APPLICABLE');
    });
  });

  describe('breakGlassLayer + BreakglassGrantRepository', () => {
    it('abstains with no grant at all', async () => {
      const patientId = await createPatient();
      const ctx = ctxFor({ resource: { type: 'patient', id: patientId } });
      expect(await evalLayer(breakGlassLayer, ctx)).toBe('NOT_APPLICABLE');
    });

    it('allows once a real, unexpired, unrevoked grant is invoked for this exact actor+patient', async () => {
      const patientId = await createPatient();
      await withTenantContext(appDb, seed.tenantA.tenantId, (trx) =>
        breakglassRepo.invoke(trx, {
          tenantId: seed.tenantA.tenantId,
          userId: seed.tenantA.adminUserId,
          patientId,
          reasonCode: 'emergency_treatment',
          justification: 'Patient arrived unconscious, no time to locate the usual attending.',
          expiresAt: new Date(Date.now() + 3600_000),
          createdBy: seed.tenantA.adminUserId,
        }),
      );

      const ctx = ctxFor({ resource: { type: 'patient', id: patientId } });
      expect(await evalLayer(breakGlassLayer, ctx)).toBe('ALLOW');
    });

    it('abstains once the grant is revoked', async () => {
      const patientId = await createPatient();
      const grant = await withTenantContext(appDb, seed.tenantA.tenantId, (trx) =>
        breakglassRepo.invoke(trx, {
          tenantId: seed.tenantA.tenantId,
          userId: seed.tenantA.adminUserId,
          patientId,
          reasonCode: 'other',
          justification: 'Testing revocation.',
          expiresAt: new Date(Date.now() + 3600_000),
          createdBy: seed.tenantA.adminUserId,
        }),
      );
      await withTenantContext(appDb, seed.tenantA.tenantId, (trx) => breakglassRepo.revoke(trx, seed.tenantA.tenantId, grant.id, seed.tenantA.adminUserId));

      const ctx = ctxFor({ resource: { type: 'patient', id: patientId } });
      expect(await evalLayer(breakGlassLayer, ctx)).toBe('NOT_APPLICABLE');
    });

    it('abstains once the grant has expired', async () => {
      const patientId = await createPatient();
      await withTenantContext(appDb, seed.tenantA.tenantId, (trx) =>
        breakglassRepo.invoke(trx, {
          tenantId: seed.tenantA.tenantId,
          userId: seed.tenantA.adminUserId,
          patientId,
          reasonCode: 'other',
          justification: 'Testing expiration.',
          expiresAt: new Date(Date.now() - 1000), // already expired
          createdBy: seed.tenantA.adminUserId,
        }),
      );

      const ctx = ctxFor({ resource: { type: 'patient', id: patientId } });
      expect(await evalLayer(breakGlassLayer, ctx)).toBe('NOT_APPLICABLE');
    });

    it('review() marks a grant reviewed', async () => {
      const patientId = await createPatient();
      const grant = await withTenantContext(appDb, seed.tenantA.tenantId, (trx) =>
        breakglassRepo.invoke(trx, {
          tenantId: seed.tenantA.tenantId,
          userId: seed.tenantA.adminUserId,
          patientId,
          reasonCode: 'other',
          justification: 'Testing review.',
          expiresAt: new Date(Date.now() + 3600_000),
          createdBy: seed.tenantA.adminUserId,
        }),
      );
      const reviewed = await withTenantContext(appDb, seed.tenantA.tenantId, (trx) =>
        breakglassRepo.review(trx, seed.tenantA.tenantId, grant.id, seed.tenantA.adminUserId),
      );
      expect(reviewed.reviewedAt).not.toBeNull();
      expect(reviewed.reviewedBy).toBe(seed.tenantA.adminUserId);
    });
  });

  describe('full PolicyEngine end-to-end with real layers', () => {
    it('a break-glass grant lets a practitioner with the scoped permission through despite no care-team relationship', async () => {
      const patientId = await createPatient();
      const practitionerId = await createPractitionerForUser(seed.tenantA.staffUserId);
      void practitionerId; // deliberately no encounter/appointment — resource-relationship would otherwise DENY

      // Grant the scoped permission to the staff user's role so role-permission itself allows.
      const staffRole = await ownerDb.selectFrom('user_roles').select('role_id').where('tenant_id', '=', seed.tenantA.tenantId).where('user_id', '=', seed.tenantA.staffUserId).where('revoked_at', 'is', null).executeTakeFirstOrThrow();
      await ownerDb
        .insertInto('role_permissions')
        .values({ role_id: staffRole.role_id, permission_key: 'patient.read.care_team_scoped' })
        .onConflict((oc) => oc.columns(['role_id', 'permission_key']).doNothing())
        .execute();

      const engine = new PolicyEngine(DEFAULT_LAYERS);
      const ctxWithoutBreakGlass = ctxFor({
        actor: { id: seed.tenantA.staffUserId, type: 'user' },
        action: 'patient.read.care_team_scoped',
        resource: { type: 'patient', id: patientId },
      });
      const beforeGrant = await withTenantContext(appDb, seed.tenantA.tenantId, (trx) => engine.authorize(ctxWithoutBreakGlass, trx));
      expect(beforeGrant).toEqual({ allowed: false, deniedBy: 'resource-relationship' });

      await withTenantContext(appDb, seed.tenantA.tenantId, (trx) =>
        breakglassRepo.invoke(trx, {
          tenantId: seed.tenantA.tenantId,
          userId: seed.tenantA.staffUserId,
          patientId,
          reasonCode: 'emergency_treatment',
          justification: 'Full end-to-end break-glass test.',
          expiresAt: new Date(Date.now() + 3600_000),
          createdBy: seed.tenantA.staffUserId,
        }),
      );

      const afterGrant = await withTenantContext(appDb, seed.tenantA.tenantId, (trx) => engine.authorize(ctxWithoutBreakGlass, trx));
      expect(afterGrant).toEqual({ allowed: true, breakGlass: true, overrodeDeny: 'resource-relationship' });
    });
  });
});
