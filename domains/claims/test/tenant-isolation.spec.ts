import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError, ValidationError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { NoopClearinghouseGateway } from '@ehr/clearinghouse-adapter';
import { ChargeService } from '@ehr/billing';
import { ClaimService } from '../src/claim/claim.service.js';
import { DenialService } from '../src/denial/denial.service.js';
import { AppealService } from '../src/appeal/appeal.service.js';
import { PriorAuthorizationService } from '../src/prior-auth/prior-auth.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — claims', () => {
  let handle: TestDbHandle;
  const chargeService = new ChargeService();
  const claimService = new ClaimService(new NoopClearinghouseGateway());
  const denialService = new DenialService();
  const appealService = new AppealService();
  const priorAuthService = new PriorAuthorizationService();

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

  it('lists denials and appeals by patient (joined through claims, no per-claim N+1)', async () => {
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
    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      claimService.recordAcknowledgement(trx, ctxA, claim.id, 'rejected', { code: 'A1', description: 'Missing diagnosis pointer' }),
    );
    const timeline = await withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.timeline(trx, ctxA, claim.id));
    const denialId = timeline.denials[0]!.id;
    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      appealService.create(trx, ctxA, denialId, { appealReason: 'Diagnosis pointer corrected — resubmitting for review.' }),
    );

    const denialsByPatient = await withTenantContext(handle.db, ctxA.tenantId, (trx) => denialService.listByPatient(trx, ctxA, tenantAPatientId));
    expect(denialsByPatient.some((d) => d.id === denialId)).toBe(true);

    const appealsByPatient = await withTenantContext(handle.db, ctxA.tenantId, (trx) => appealService.listByPatient(trx, ctxA, tenantAPatientId));
    expect(appealsByPatient.some((a) => a.denialId === denialId)).toBe(true);

    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => denialService.listByPatient(trx, ctxB, tenantAPatientId)),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => appealService.listByPatient(trx, ctxB, tenantAPatientId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('cannot submit a claim that is not draft or rejected', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.submit(trx, ctxA, tenantAClaimId)),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  describe('real pre-submission scrubbing (Athelas-parity pass)', () => {
    async function createCoverage(overrides: Partial<{ status: string; effectiveStart: string; effectiveEnd: string | null }> = {}) {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      return withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
        const row = await trx
          .insertInto('coverages')
          .values({
            tenant_id: ctxA.tenantId,
            patient_id: tenantAPatientId,
            payer_name: 'Acme Payer',
            member_id: 'M-SCRUB-1',
            coverage_type: 'primary',
            effective_start: overrides.effectiveStart ?? '2024-01-01',
            effective_end: overrides.effectiveEnd ?? null,
            status: overrides.status ?? 'active',
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        return row.id;
      });
    }

    async function insertEligibilityCheck(coverageId: string, isEligible: boolean) {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        trx
          .insertInto('eligibility_checks')
          .values({
            tenant_id: ctxA.tenantId,
            patient_id: tenantAPatientId,
            coverage_id: coverageId,
            is_eligible: isEligible,
            raw_response: JSON.stringify({}),
            status: 'checked',
            created_by: ctxA.actor!.id,
            updated_by: ctxA.actor!.id,
          })
          .execute(),
      );
    }

    async function claimWithCoverage(coverageId: string, overrides: { code?: string; diagnosisCodes?: string[] } = {}) {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const charge = await createCodedCharge(handle, ctxA, overrides);
      return withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        claimService.create(trx, ctxA, tenantAPatientId, {
          encounterId: tenantAEncounterId,
          billingPractitionerId: tenantAPractitionerId,
          coverageId,
          chargeIds: [charge.id],
        }),
      );
    }

    it('blocks submission when the coverage has no eligibility check on file', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const coverageId = await createCoverage();
      const claim = await claimWithCoverage(coverageId);
      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.submit(trx, ctxA, claim.id)),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('blocks submission when the coverage is not active', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const coverageId = await createCoverage({ status: 'terminated' });
      await insertEligibilityCheck(coverageId, true);
      const claim = await claimWithCoverage(coverageId);
      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.submit(trx, ctxA, claim.id)),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('blocks submission when the most recent eligibility check reports ineligible', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const coverageId = await createCoverage();
      await insertEligibilityCheck(coverageId, false);
      const claim = await claimWithCoverage(coverageId);
      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.submit(trx, ctxA, claim.id)),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('blocks submission on a diagnosis code not found in ICD-10-CM', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const charge = await createCodedCharge(handle, ctxA, { diagnosisCodes: ['Z99.999999'] });
      const claim = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        claimService.create(trx, ctxA, tenantAPatientId, {
          encounterId: tenantAEncounterId,
          billingPractitionerId: tenantAPractitionerId,
          chargeIds: [charge.id],
        }),
      );
      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.submit(trx, ctxA, claim.id)),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('blocks submission on a sex-restricted diagnosis conflicting with the patient', async () => {
      // tenantAPatientId has no sexAtBirth recorded by default — insert a female-only pregnancy
      // code against a patient explicitly recorded as male to prove the conflict actually fires.
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const { patientId: malePatientId, encounterId: maleEncounterId } = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
        const patient = await trx
          .insertInto('patients')
          .values({
            tenant_id: ctxA.tenantId,
            given_name: 'SexConflict',
            family_name: `Claims-${Date.now()}`,
            date_of_birth: '1979-11-02',
            sex_at_birth: 'M',
            status: 'active',
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        const appointment = await trx
          .insertInto('appointments')
          .values({
            tenant_id: ctxA.tenantId,
            patient_id: patient.id,
            location_id: handle.seed.tenantA.locationId,
            practitioner_id: tenantAPractitionerId,
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
            patient_id: patient.id,
            appointment_id: appointment.id,
            location_id: handle.seed.tenantA.locationId,
            practitioner_id: tenantAPractitionerId,
            encounter_type: 'office_visit',
            status: 'roomed',
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        return { patientId: patient.id, encounterId: encounter.id };
      });
      const charge = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        chargeService.create(trx, ctxA, malePatientId, {
          encounterId: maleEncounterId,
          billingPractitionerId: tenantAPractitionerId,
          codeSystem: 'CPT',
          code: '99213',
          description: 'Office visit',
          units: 1,
          unitPrice: 150,
          diagnosisCodes: ['O80'],
        }),
      ).then((c) => withTenantContext(handle.db, ctxA.tenantId, (trx) => chargeService.finalizeCoding(trx, ctxA, c.id, {})));
      const claim = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        claimService.create(trx, ctxA, malePatientId, {
          encounterId: maleEncounterId,
          billingPractitionerId: tenantAPractitionerId,
          chargeIds: [charge.id],
        }),
      );
      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.submit(trx, ctxA, claim.id)),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('submits cleanly when the coverage is active, effective, and has a recent eligible check', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const coverageId = await createCoverage();
      await insertEligibilityCheck(coverageId, true);
      const claim = await claimWithCoverage(coverageId);
      const submitted = await withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.submit(trx, ctxA, claim.id));
      expect(submitted.status).toBe('submitted');
    });
  });

  describe('denial appeal automation (Athelas-parity pass)', () => {
    async function createDeniedClaim() {
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
      await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        claimService.recordAcknowledgement(trx, ctxA, claim.id, 'rejected', { code: 'CO-50', description: 'Not medically necessary' }),
      );
      const timeline = await withTenantContext(handle.db, ctxA.tenantId, (trx) => claimService.timeline(trx, ctxA, claim.id));
      return timeline.denials[timeline.denials.length - 1]!.id;
    }

    it('creates a draft appeal and rejects a second active appeal on the same denial', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const denialId = await createDeniedClaim();

      const appeal = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        appealService.create(trx, ctxA, denialId, { appealReason: 'The service was medically necessary per attached chart notes.' }),
      );
      expect(appeal.status).toBe('draft');

      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) =>
          appealService.create(trx, ctxA, denialId, { appealReason: 'A second, duplicate appeal attempt.' }),
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('submitting an appeal moves the denial to appealed and blocks a direct resolve', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const denialId = await createDeniedClaim();
      const appeal = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        appealService.create(trx, ctxA, denialId, { appealReason: 'The service was medically necessary.' }),
      );

      const submitted = await withTenantContext(handle.db, ctxA.tenantId, (trx) => appealService.submit(trx, ctxA, appeal.id));
      expect(submitted.status).toBe('submitted');
      expect(submitted.submittedAt).not.toBeNull();

      const denial = await withTenantContext(handle.db, ctxA.tenantId, (trx) => denialService.getById(trx, ctxA, denialId));
      expect(denial.status).toBe('appealed');

      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => denialService.resolve(trx, ctxA, denialId, { resolutionNotes: 'Trying to resolve directly' })),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('a won appeal resolves the denial; a lost appeal reopens it for a fresh appeal', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

      const wonDenialId = await createDeniedClaim();
      const wonAppeal = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        appealService.create(trx, ctxA, wonDenialId, { appealReason: 'Medically necessary.' }),
      );
      await withTenantContext(handle.db, ctxA.tenantId, (trx) => appealService.submit(trx, ctxA, wonAppeal.id));
      const decidedWon = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        appealService.decide(trx, ctxA, wonAppeal.id, { outcome: 'won', decisionNotes: 'Payer overturned the denial.' }),
      );
      expect(decidedWon.status).toBe('won');
      const wonDenial = await withTenantContext(handle.db, ctxA.tenantId, (trx) => denialService.getById(trx, ctxA, wonDenialId));
      expect(wonDenial.status).toBe('resolved');

      const lostDenialId = await createDeniedClaim();
      const lostAppeal = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        appealService.create(trx, ctxA, lostDenialId, { appealReason: 'Medically necessary.' }),
      );
      await withTenantContext(handle.db, ctxA.tenantId, (trx) => appealService.submit(trx, ctxA, lostAppeal.id));
      const decidedLost = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        appealService.decide(trx, ctxA, lostAppeal.id, { outcome: 'lost', decisionNotes: 'Payer upheld the denial.' }),
      );
      expect(decidedLost.status).toBe('lost');
      const lostDenial = await withTenantContext(handle.db, ctxA.tenantId, (trx) => denialService.getById(trx, ctxA, lostDenialId));
      expect(lostDenial.status).toBe('open');

      const secondAppeal = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        appealService.create(trx, ctxA, lostDenialId, { appealReason: 'Escalating with additional documentation.' }),
      );
      expect(secondAppeal.status).toBe('draft');
    });

    it('cannot appeal a denial that is not open, and cross-tenant reads are blocked', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const denialId = await createDeniedClaim();
      await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        denialService.resolve(trx, ctxA, denialId, { resolutionNotes: 'Resolved without an appeal' }),
      );

      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => appealService.create(trx, ctxA, denialId, { appealReason: 'Too late.' })),
      ).rejects.toBeInstanceOf(ConflictError);

      const freshDenialId = await createDeniedClaim();
      const appeal = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        appealService.create(trx, ctxA, freshDenialId, { appealReason: 'Reviewable from tenant A only.' }),
      );

      const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
      await expect(
        withTenantContext(handle.db, ctxB.tenantId, (trx) => appealService.getById(trx, ctxB, appeal.id)),
      ).rejects.toBeInstanceOf(NotFoundError);

      const rows = await withTenantContext(handle.db, ctxB.tenantId, (trx) => trx.selectFrom('appeals').selectAll().where('id', '=', appeal.id).execute());
      expect(rows).toHaveLength(0);
    });
  });

  describe('prior authorization tracking (Tier 2 platform gap)', () => {
    async function createCoverage() {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      return withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
        const row = await trx
          .insertInto('coverages')
          .values({
            tenant_id: ctxA.tenantId,
            patient_id: tenantAPatientId,
            payer_name: 'Acme Payer',
            member_id: `M-PRIORAUTH-${Date.now()}`,
            coverage_type: 'primary',
            effective_start: '2024-01-01',
            status: 'active',
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        return row.id;
      });
    }

    it('creates a pending prior authorization', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const coverageId = await createCoverage();
      const auth = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        priorAuthService.create(trx, ctxA, tenantAPatientId, {
          coverageId,
          requestedByPractitionerId: tenantAPractitionerId,
          procedureCode: '70551',
          procedureDescription: 'MRI brain without contrast',
          diagnosisCode: 'G43.909',
        }),
      );
      expect(auth.status).toBe('pending');
      expect(auth.payerReferenceNumber).toBeNull();
    });

    it('rejects a prior authorization against a coverage belonging to a different patient', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const otherPatientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
        const row = await trx
          .insertInto('patients')
          .values({ tenant_id: ctxA.tenantId, given_name: 'Isolation', family_name: `PriorAuthOther-${Date.now()}`, date_of_birth: '1975-05-05', status: 'active' })
          .returning('id')
          .executeTakeFirstOrThrow();
        return row.id;
      });
      const coverageId = await createCoverage();
      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) =>
          priorAuthService.create(trx, ctxA, otherPatientId, {
            coverageId,
            requestedByPractitionerId: tenantAPractitionerId,
            procedureCode: '70551',
            procedureDescription: 'MRI brain without contrast',
            diagnosisCode: 'G43.909',
          }),
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('records an approval requiring a validUntil date, and rejects a second decision', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const coverageId = await createCoverage();
      const auth = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        priorAuthService.create(trx, ctxA, tenantAPatientId, {
          coverageId,
          requestedByPractitionerId: tenantAPractitionerId,
          procedureCode: '29881',
          procedureDescription: 'Knee arthroscopy',
          diagnosisCode: 'M23.51',
        }),
      );

      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) =>
          priorAuthService.recordDecision(trx, ctxA, auth.id, { decision: 'approved', payerReferenceNumber: 'PA-1', validUntil: undefined }),
        ),
      ).rejects.toBeInstanceOf(ConflictError);

      const approved = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        priorAuthService.recordDecision(trx, ctxA, auth.id, {
          decision: 'approved',
          payerReferenceNumber: 'PA-12345',
          validFrom: '2026-01-01',
          validUntil: '2026-06-01',
        }),
      );
      expect(approved.status).toBe('approved');
      expect(approved.payerReferenceNumber).toBe('PA-12345');
      expect(approved.validUntil).toBe('2026-06-01');

      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) =>
          priorAuthService.recordDecision(trx, ctxA, auth.id, { decision: 'denied' }),
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('records a denial with a reason, and follows the expire/cancel lifecycle', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const coverageId = await createCoverage();

      const denied = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
        const auth = await priorAuthService.create(trx, ctxA, tenantAPatientId, {
          coverageId,
          requestedByPractitionerId: tenantAPractitionerId,
          procedureCode: '27447',
          procedureDescription: 'Total knee replacement',
          diagnosisCode: 'M17.11',
        });
        return priorAuthService.recordDecision(trx, ctxA, auth.id, { decision: 'denied', denialReason: 'Not medically necessary per payer review' });
      });
      expect(denied.status).toBe('denied');
      expect(denied.denialReason).toBe('Not medically necessary per payer review');

      await expect(
        withTenantContext(handle.db, ctxA.tenantId, (trx) => priorAuthService.expire(trx, ctxA, denied.id)),
      ).rejects.toBeInstanceOf(ConflictError);

      const approvedThenExpired = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
        const auth = await priorAuthService.create(trx, ctxA, tenantAPatientId, {
          coverageId,
          requestedByPractitionerId: tenantAPractitionerId,
          procedureCode: '99999',
          procedureDescription: 'Test procedure',
          diagnosisCode: 'Z00.00',
        });
        await priorAuthService.recordDecision(trx, ctxA, auth.id, { decision: 'approved', validUntil: '2026-01-01' });
        return priorAuthService.expire(trx, ctxA, auth.id);
      });
      expect(approvedThenExpired.status).toBe('expired');

      const cancelled = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
        const auth = await priorAuthService.create(trx, ctxA, tenantAPatientId, {
          coverageId,
          requestedByPractitionerId: tenantAPractitionerId,
          procedureCode: '11111',
          procedureDescription: 'Another test procedure',
          diagnosisCode: 'Z00.00',
        });
        return priorAuthService.cancel(trx, ctxA, auth.id, 'Patient changed provider');
      });
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.notes).toBe('Patient changed provider');
    });

    it('Tenant B cannot read a Tenant A prior authorization, and RLS blocks a raw cross-tenant query', async () => {
      const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
      const coverageId = await createCoverage();
      const auth = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        priorAuthService.create(trx, ctxA, tenantAPatientId, {
          coverageId,
          requestedByPractitionerId: tenantAPractitionerId,
          procedureCode: '70551',
          procedureDescription: 'MRI brain without contrast',
          diagnosisCode: 'G43.909',
        }),
      );

      const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
      await expect(
        withTenantContext(handle.db, ctxB.tenantId, (trx) => priorAuthService.getById(trx, ctxB, auth.id)),
      ).rejects.toBeInstanceOf(NotFoundError);

      const rows = await withTenantContext(handle.db, ctxB.tenantId, (trx) =>
        trx.selectFrom('prior_authorizations').selectAll().where('id', '=', auth.id).execute(),
      );
      expect(rows).toHaveLength(0);
    });
  });
});
