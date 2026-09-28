import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { ReferralService } from '../src/referral/referral.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — referrals', () => {
  let handle: TestDbHandle;
  const referralService = new ReferralService();

  let tenantAPatientId: string;
  let tenantAReferringPractitionerId: string;
  let tenantASpecialistId: string;
  let tenantAReferralId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    tenantAPatientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({ tenant_id: ctxA.tenantId, given_name: 'Isolation', family_name: `Referral-${Date.now()}`, date_of_birth: '1985-04-12', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });

    const workforceIdentity = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      trx
        .insertInto('workforce_identities')
        .values({ tenant_id: ctxA.tenantId, user_id: handle.seed.tenantA.adminUserId, organization_id: handle.seed.tenantA.organizationId, status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );
    [tenantAReferringPractitionerId, tenantASpecialistId] = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const referring = await trx
        .insertInto('practitioners')
        .values({ tenant_id: ctxA.tenantId, workforce_identity_id: workforceIdentity.id, display_name: 'Dr. Referring Test', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      const specialist = await trx
        .insertInto('practitioners')
        .values({ tenant_id: ctxA.tenantId, workforce_identity_id: workforceIdentity.id, display_name: 'Dr. Specialist Test', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      return [referring.id, specialist.id];
    });

    const referral = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      referralService.create(trx, ctxA, tenantAPatientId, {
        referringPractitionerId: tenantAReferringPractitionerId,
        referredToPractitionerId: tenantASpecialistId,
        externalProviderName: null,
        specialty: 'Cardiology',
        reason: 'Evaluate new-onset arrhythmia',
        urgency: 'urgent',
      }),
    );
    tenantAReferralId = referral.id;
  });

  afterAll(() => handle.close());

  it('creates a referral in pending status', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const referral = await withTenantContext(handle.db, ctxA.tenantId, (trx) => referralService.getById(trx, ctxA, tenantAReferralId));
    expect(referral.status).toBe('pending');
    expect(referral.specialty).toBe('Cardiology');
    expect(referral.urgency).toBe('urgent');
    expect(referral.referredToPractitionerId).toBe(tenantASpecialistId);
  });

  it('allows an external-provider referral with no internal practitioner', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const referral = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      referralService.create(trx, ctxA, tenantAPatientId, {
        referringPractitionerId: tenantAReferringPractitionerId,
        referredToPractitionerId: null,
        externalProviderName: 'Riverside Orthopedics',
        specialty: 'Orthopedics',
        reason: 'Chronic knee pain',
        urgency: 'routine',
      }),
    );
    expect(referral.referredToPractitionerId).toBeNull();
    expect(referral.externalProviderName).toBe('Riverside Orthopedics');
  });

  it('rejects a referral to a practitioner that does not exist', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        referralService.create(trx, ctxA, tenantAPatientId, {
          referringPractitionerId: tenantAReferringPractitionerId,
          referredToPractitionerId: '00000000-0000-0000-0000-000000000000',
          externalProviderName: null,
          specialty: 'Neurology',
          reason: 'test',
          urgency: 'routine',
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('follows the real status lifecycle: pending -> sent -> scheduled -> completed', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const sent = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      referralService.updateStatus(trx, ctxA, tenantAReferralId, { status: 'sent' }),
    );
    expect(sent.status).toBe('sent');

    const scheduled = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      referralService.updateStatus(trx, ctxA, tenantAReferralId, { status: 'scheduled', notes: 'Booked for next Tuesday' }),
    );
    expect(scheduled.status).toBe('scheduled');
    expect(scheduled.notes).toBe('Booked for next Tuesday');

    const completed = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      referralService.updateStatus(trx, ctxA, tenantAReferralId, { status: 'completed' }),
    );
    expect(completed.status).toBe('completed');
  });

  it('rejects an illegal status transition (cannot jump straight to completed)', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const fresh = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      referralService.create(trx, ctxA, tenantAPatientId, {
        referringPractitionerId: tenantAReferringPractitionerId,
        referredToPractitionerId: tenantASpecialistId,
        externalProviderName: null,
        specialty: 'Dermatology',
        reason: 'Suspicious mole',
        urgency: 'routine',
      }),
    );
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => referralService.updateStatus(trx, ctxA, fresh.id, { status: 'completed' })),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('lists referrals for a patient', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const referrals = await withTenantContext(handle.db, ctxA.tenantId, (trx) => referralService.listByPatient(trx, ctxA, tenantAPatientId));
    expect(referrals.some((r) => r.id === tenantAReferralId)).toBe(true);
  });

  it('Tenant B cannot read a Tenant A referral by known UUID, and RLS blocks a raw cross-tenant query', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => referralService.getById(trx, ctxB, tenantAReferralId)),
    ).rejects.toBeInstanceOf(NotFoundError);

    const rows = await withTenantContext(handle.db, ctxB.tenantId, (trx) =>
      trx.selectFrom('referrals').selectAll().where('id', '=', tenantAReferralId).execute(),
    );
    expect(rows).toHaveLength(0);
  });
});
