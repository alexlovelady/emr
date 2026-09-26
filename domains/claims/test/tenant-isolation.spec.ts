import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError, ValidationError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { NoopClearinghouseGateway } from '@ehr/clearinghouse-adapter';
import { ChargeService } from '@ehr/billing';
import { ClaimService } from '../src/claim/claim.service.js';
import { DenialService } from '../src/denial/denial.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — claims', () => {
  let handle: TestDbHandle;
  const chargeService = new ChargeService();
  const claimService = new ClaimService(new NoopClearinghouseGateway());
  const denialService = new DenialService();

  let tenantAPatientId: string;
  let tenantAPractitionerId: string;
  let tenantAEncounterId: string;
  let tenantAClaimId: string;

  async function createCodedCharge(handleRef: TestDbHandle, ctxA: ReturnType<typeof requestContextFor>, overrides: { code?: string; diagnosisCodes?: string[] } = {}) {
    const charge = await withTenantContext(handleRef.db, ctxA.tenantId, (trx) =>
      chargeService.create(trx, ctxA, tenantAPatientId, {
        encounterId: tenantAEncounterId,
        billingPractitionerId: tenantAPractitionerId,
        codeSystem: 'CPT',
        code: overrides.code ?? '99213',
        description: 'Office visit, established patient, level 3',
        units: 1,
        unitPrice: 150,
        diagnosisCodes: overrides.diagnosisCodes ?? ['E11.9'],
      }),
    );
    return withTenantContext(handleRef.db, ctxA.tenantId, (trx) => chargeService.finalizeCoding(trx, ctxA, charge.id, {}));
  }

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    tenantAPatientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: ctxA.tenantId,
          given_name: 'Isolation',
          family_name: `Claims-${Date.now()}`,
          date_of_birth: '1979-11-02',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });

    tenantAEncounterId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const workforceIdentity = await trx
        .insertInto('workforce_identities')
        .values({
          tenant_id: ctxA.tenantId,
          user_id: handle.seed.tenantA.adminUserId,
          organization_id: handle.seed.tenantA.organizationId,
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const practitioner = await trx
        .insertInto('practitioners')
        .values({
          tenant_id: ctxA.tenantId,
          workforce_identity_id: workforceIdentity.id,
          display_name: 'Dr. Claims Test',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      tenantAPractitionerId = practitioner.id;
      const appointment = await trx
        .insertInto('appointments')
        .values({
          tenant_id: ctxA.tenantId,
          patient_id: tenantAPatientId,
          location_id: handle.seed.tenantA.locationId,
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
          patient_id: tenantAPatientId,
          appointment_id: appointment.id,
          location_id: handle.seed.tenantA.locationId,
          practitioner_id: practitioner.id,
          encounter_type: 'office_visit',
          status: 'roomed',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return encounter.id;
    });

    const charge = await createCodedCharge(handle, ctxA);
    const claim = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      claimService.create(trx, ctxA, tenantAPatientId, {
        encounterId: tenantAEncounterId,
        billingPractitionerId: tenantAPractitionerId,
        chargeIds: [charge.id],
      }),
    );
    tenantAClaimId = claim.id;
  });

  afterAll(() => handle.close());

  it('Tenant B cannot read a Tenant A claim by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => claimService.getById(trx, ctxB, tenantAClaimId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Row-Level Security blocks a query with no tenant_id predicate at all', async () => {
    const rows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('claims').selectAll().where('id', '=', tenantAClaimId).execute(),
    );
    expect(rows).toHaveLength(0);
  });

  it('a claim with an invalid CPT code fails the scrubber on submit', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const badCharge = await createCodedCharge(handle, ctxA, { code: 'NOT-A-CODE' });
    const claim = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      claimService.create(trx, ctxA, tenantAPatientId, {
        encounterId: tenantAEncounterId,
        billingPractitionerId: tenantAPractitionerId,
        chargeIds: [badCharge.id],
      }),
    );
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.submit(trx, ctxA, claim.id)),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('submits a clean claim, producing ClaimVersion 2 and a gateway transaction id', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const submitted = await withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.submit(trx, ctxA, tenantAClaimId));
    expect(submitted.status).toBe('submitted');
    expect(submitted.currentVersion).toBe(2);
    expect(submitted.clearinghouseTransactionId).toMatch(/^noop-claim-/);

    const timeline = await withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.timeline(trx, ctxA, tenantAClaimId));
    expect(timeline.versions).toHaveLength(2);
    expect(timeline.versions[0]?.versionStatus).toBe('draft');
    expect(timeline.versions[1]?.versionStatus).toBe('submitted');
  });

  it('an accepted 277CA transitions the claim, and a redelivery is idempotent', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const accepted = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      claimService.recordAcknowledgement(trx, ctxA, tenantAClaimId, 'accepted', null),
    );
    expect(accepted.status).toBe('accepted');

    const redelivered = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      claimService.recordAcknowledgement(trx, ctxA, tenantAClaimId, 'accepted', null),
    );
    expect(redelivered.status).toBe('accepted');
  });

  it('a rejected 277CA creates a Denial and Task, and the denial can be resolved', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const charge = await createCodedCharge(handle, ctxA);
    const claim = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      claimService.create(trx, ctxA, tenantAPatientId, {
        encounterId: tenantAEncounterId,
        billingPractitionerId: tenantAPractitionerId,
        chargeIds: [charge.id],
      }),
    );
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.submit(trx, ctxA, claim.id));
    const rejected = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      claimService.recordAcknowledgement(trx, ctxA, claim.id, 'rejected', { code: 'A1', description: 'Missing diagnosis pointer' }),
    );
    expect(rejected.status).toBe('rejected');

    const timeline = await withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.timeline(trx, ctxA, claim.id));
    expect(timeline.denials).toHaveLength(1);
    expect(timeline.denials[0]?.status).toBe('open');
    const denialId = timeline.denials[0]!.id;

    const resolved = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      denialService.resolve(trx, ctxA, denialId, { resolutionNotes: 'Corrected diagnosis pointer and will resubmit' }),
    );
    expect(resolved.status).toBe('resolved');

    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => denialService.getById(trx, ctxB, denialId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('cannot submit a claim that is not draft or rejected', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.submit(trx, ctxA, tenantAClaimId)),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
