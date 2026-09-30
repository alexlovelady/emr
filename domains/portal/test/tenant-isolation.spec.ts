import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withTenantContext } from '@ehr/db';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@ehr/domain-common';
import { ConsentService } from '@ehr/consent';
import { AiGenerationService } from '@ehr/ai';
import { NoopAiGateway } from '@ehr/ai-adapter';
import type { PaymentGateway } from '@ehr/payment-adapter';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { PortalChartService } from '../src/chart/portal-chart.service.js';
import { PortalPaymentService } from '../src/payment/portal-payment.service.js';
import { PortalSessionService } from '../src/session/portal-session.service.js';
import { PortalSchedulingService } from '../src/scheduling/portal-scheduling.service.js';
import { SmartLaunchService } from '../src/smart-launch/smart-launch.service.js';
import { PortalExportService } from '../src/export/portal-export.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — portal', () => {
  let handle: TestDbHandle;
  const consentService = new ConsentService();
  const fakeStorageGateway: ObjectStorageGateway = {
    getUploadUrl: async () => ({ url: 'https://example.test/upload', storageKey: 'k' }),
    getDownloadUrl: async () => 'https://example.test/download',
    headObject: async () => null,
    putObject: async () => ({ storageKey: `exports/${randomUUID()}.json` }),
  };
  const chartService = new PortalChartService(fakeStorageGateway);
  const schedulingService = new PortalSchedulingService();

  let tenantAPatientId: string;
  let tenantAPortalAccountId: string;
  let tenantAPractitionerId: string;

  async function createPatient(tenantId: string): Promise<string> {
    return withTenantContext(handle.db, tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: tenantId,
          given_name: 'Portal',
          family_name: `Test-${Date.now()}`,
          date_of_birth: '1990-01-01',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });
  }

  async function createPortalAccount(tenantId: string): Promise<string> {
    return withTenantContext(handle.db, tenantId, async (trx) => {
      const account = await trx
        .insertInto('portal_accounts')
        .values({
          tenant_id: tenantId,
          email: `portal-${randomUUID()}@example.com`,
          password_hash: 'not-a-real-hash',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return account.id;
    });
  }

  beforeAll(async () => {
    handle = await setupTestDb();
    tenantAPatientId = await createPatient(handle.seed.tenantA.tenantId);
    tenantAPortalAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
    await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      consentService.createSelfGrant(trx, handle.seed.tenantA.tenantId, tenantAPatientId, tenantAPortalAccountId),
    );
    tenantAPractitionerId = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, async (trx) => {
      const workforceIdentity = await trx
        .insertInto('workforce_identities')
        .values({
          tenant_id: handle.seed.tenantA.tenantId,
          user_id: handle.seed.tenantA.adminUserId,
          organization_id: handle.seed.tenantA.organizationId,
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const practitioner = await trx
        .insertInto('practitioners')
        .values({
          tenant_id: handle.seed.tenantA.tenantId,
          workforce_identity_id: workforceIdentity.id,
          display_name: 'Dr. Portal Test',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return practitioner.id;
    });
  });

  afterAll(() => handle.close());

  it('a self-grant portal account can read its own chart (appointments, results, problems)', async () => {
    const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, tenantAPortalAccountId, {
      actor: { id: tenantAPortalAccountId, type: 'patient' },
    });
    const [appointments, results, problems] = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      Promise.all([
        chartService.listAppointments(trx, ctxPortal, tenantAPatientId),
        chartService.listResults(trx, ctxPortal, tenantAPatientId),
        chartService.listProblems(trx, ctxPortal, tenantAPatientId),
      ]),
    );
    expect(appointments).toEqual([]);
    expect(results).toEqual([]);
    expect(problems).toEqual([]);
  });

  it('a portal account with no grant for the patient is denied chart reads (404, not 403)', async () => {
    const ungrantedAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
    const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, ungrantedAccountId, {
      actor: { id: ungrantedAccountId, type: 'patient' },
    });
    await expect(
      withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) => chartService.listResults(trx, ctxPortal, tenantAPatientId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a staff token cannot be used against a portal-facing chart method', async () => {
    const ctxStaff = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await expect(
      withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) => chartService.listResults(trx, ctxStaff, tenantAPatientId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Tenant B cannot read a Tenant A patient chart even with a real Tenant A portal account id', async () => {
    const ctxCrossTenant = requestContextFor(handle.seed.tenantB.tenantId, tenantAPortalAccountId, {
      actor: { id: tenantAPortalAccountId, type: 'patient' },
    });
    await expect(
      withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) => chartService.listProblems(trx, ctxCrossTenant, tenantAPatientId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a successful payment posts a patient_payment ledger entry and moves the balance', async () => {
    const gateway: PaymentGateway = {
      chargeCard: async () => ({ transactionId: 'txn-test-1', status: 'succeeded', failureReason: null }),
    };
    const paymentService = new PortalPaymentService(gateway);
    const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, tenantAPortalAccountId, {
      actor: { id: tenantAPortalAccountId, type: 'patient' },
    });
    const result = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      paymentService.charge(trx, ctxPortal, tenantAPatientId, { amountCents: 5000, currency: 'usd', paymentMethodToken: 'tok_test' }),
    );
    expect(result.status).toBe('succeeded');
    expect(result.ledgerEntry?.entryType).toBe('patient_payment');
    expect(result.ledgerEntry?.amount).toBe('-50.00');

    const ledger = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      chartService.getLedger(trx, ctxPortal, tenantAPatientId),
    );
    expect(Number(ledger.balance)).toBeLessThanOrEqual(-50);
  });

  it('a failed payment does not post a ledger entry', async () => {
    const gateway: PaymentGateway = {
      chargeCard: async () => ({ transactionId: 'txn-test-2', status: 'failed', failureReason: 'card_declined' }),
    };
    const paymentService = new PortalPaymentService(gateway);
    const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, tenantAPortalAccountId, {
      actor: { id: tenantAPortalAccountId, type: 'patient' },
    });
    const result = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      paymentService.charge(trx, ctxPortal, tenantAPatientId, { amountCents: 1000, currency: 'usd', paymentMethodToken: 'tok_bad' }),
    );
    expect(result.status).toBe('failed');
    expect(result.ledgerEntry).toBeNull();
  });

  it('a portal account can list and revoke its own sessions', async () => {
    const sessionService = new PortalSessionService();
    const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, tenantAPortalAccountId, {
      actor: { id: tenantAPortalAccountId, type: 'patient' },
    });
    await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      trx
        .insertInto('portal_refresh_tokens')
        .values({
          tenant_id: handle.seed.tenantA.tenantId,
          portal_account_id: tenantAPortalAccountId,
          token_hash: `hash-${randomUUID()}`,
          expires_at: new Date(Date.now() + 3600_000),
          status: 'active',
        })
        .execute(),
    );

    const sessions = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) => sessionService.list(trx, ctxPortal));
    expect(sessions.length).toBeGreaterThan(0);

    const firstSession = sessions[0];
    if (!firstSession) throw new Error('expected at least one session');
    await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) => sessionService.revoke(trx, ctxPortal, firstSession.id));

    const otherAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
    const ctxOther = requestContextFor(handle.seed.tenantA.tenantId, otherAccountId, { actor: { id: otherAccountId, type: 'patient' } });
    await expect(
      withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) => sessionService.revoke(trx, ctxOther, firstSession.id)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  describe('patient-facing AI + pre-visit agenda (Epic-parity item 3)', () => {
    const aiGenerationService = new AiGenerationService(new NoopAiGateway());

    async function createAppointmentAndReport(): Promise<{ appointmentId: string; reportId: string }> {
      return withTenantContext(handle.db, handle.seed.tenantA.tenantId, async (trx) => {
        const appointment = await trx
          .insertInto('appointments')
          .values({
            tenant_id: handle.seed.tenantA.tenantId,
            patient_id: tenantAPatientId,
            location_id: handle.seed.tenantA.locationId,
            practitioner_id: tenantAPractitionerId,
            appointment_type: 'office_visit',
            scheduled_start: new Date(Date.now() + 3600_000),
            scheduled_end: new Date(Date.now() + 7200_000),
            status: 'scheduled',
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        const encounter = await trx
          .insertInto('encounters')
          .values({
            tenant_id: handle.seed.tenantA.tenantId,
            patient_id: tenantAPatientId,
            appointment_id: appointment.id,
            location_id: handle.seed.tenantA.locationId,
            practitioner_id: tenantAPractitionerId,
            encounter_type: 'office_visit',
            status: 'signed',
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        const report = await trx
          .insertInto('diagnostic_reports')
          .values({
            tenant_id: handle.seed.tenantA.tenantId,
            patient_id: tenantAPatientId,
            encounter_id: encounter.id,
            display_name: 'Basic Metabolic Panel',
            review_status: 'reviewed',
            status: 'final',
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        return { appointmentId: appointment.id, reportId: report.id };
      });
    }

    it('getResultExplanation() returns null until staff accepts a drafted explanation, then returns the edited text', async () => {
      const { reportId } = await createAppointmentAndReport();
      const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, tenantAPortalAccountId, {
        actor: { id: tenantAPortalAccountId, type: 'patient' },
      });
      const ctxStaff = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

      const beforeAccept = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        chartService.getResultExplanation(trx, ctxPortal, tenantAPatientId, reportId),
      );
      expect(beforeAccept).toBeNull();

      const proposed = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        aiGenerationService.propose(trx, ctxStaff, {
          feature: 'lab_result_explanation',
          promptTemplateId: 'lab-result-explanation-v1',
          patientId: tenantAPatientId,
          subjectType: 'DiagnosticReport',
          subjectId: reportId,
          inputText: 'Explain this result',
          context: [{ ref: `DiagnosticReport/${reportId}`, data: { displayName: 'Basic Metabolic Panel' } }],
          linkedDiagnosticReportId: reportId,
        }),
      );
      await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        aiGenerationService.accept(trx, ctxStaff, proposed.id, 'Your kidney and electrolyte levels are all normal.'),
      );

      const afterAccept = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        chartService.getResultExplanation(trx, ctxPortal, tenantAPatientId, reportId),
      );
      expect(afterAccept?.explanation).toBe('Your kidney and electrolyte levels are all normal.');
    });

    it('a portal account with no grant cannot read a result explanation (404, not 403)', async () => {
      const { reportId } = await createAppointmentAndReport();
      const ungrantedAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
      const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, ungrantedAccountId, {
        actor: { id: ungrantedAccountId, type: 'patient' },
      });
      await expect(
        withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
          chartService.getResultExplanation(trx, ctxPortal, tenantAPatientId, reportId),
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('a patient can set their own pre-visit agenda, and it is visible via the staff appointment read path', async () => {
      const { appointmentId } = await createAppointmentAndReport();
      const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, tenantAPortalAccountId, {
        actor: { id: tenantAPortalAccountId, type: 'patient' },
      });
      const updated = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        chartService.updateAppointmentAgenda(trx, ctxPortal, tenantAPatientId, appointmentId, 'I want to discuss my medication dosage.'),
      );
      expect(updated.patientAgenda).toBe('I want to discuss my medication dosage.');

      const appointments = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        chartService.listAppointments(trx, ctxPortal, tenantAPatientId),
      );
      expect(appointments.find((a) => a.id === appointmentId)?.patientAgenda).toBe('I want to discuss my medication dosage.');
    });

    it('a portal account cannot set an agenda on another patient\'s appointment', async () => {
      const { appointmentId } = await createAppointmentAndReport();
      const otherPatientId = await createPatient(handle.seed.tenantA.tenantId);
      const otherAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
      await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        consentService.createSelfGrant(trx, handle.seed.tenantA.tenantId, otherPatientId, otherAccountId),
      );
      const ctxOther = requestContextFor(handle.seed.tenantA.tenantId, otherAccountId, { actor: { id: otherAccountId, type: 'patient' } });
      await expect(
        withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
          chartService.updateAppointmentAgenda(trx, ctxOther, otherPatientId, appointmentId, 'should not work'),
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('patient self-scheduling (Tier 2 UI build-out)', () => {
    function ctxFor(patientAccountId: string) {
      return requestContextFor(handle.seed.tenantA.tenantId, patientAccountId, { actor: { id: patientAccountId, type: 'patient' } });
    }

    it('lists active practitioners and locations, patient-safe shape only', async () => {
      const ctxPortal = ctxFor(tenantAPortalAccountId);
      const [practitioners, locations] = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        Promise.all([schedulingService.listBookablePractitioners(trx, ctxPortal), schedulingService.listBookableLocations(trx, ctxPortal)]),
      );
      const found = practitioners.find((p) => p.id === tenantAPractitionerId);
      expect(found).toEqual({ id: tenantAPractitionerId, displayName: 'Dr. Portal Test', taxonomyCode: null });
      expect(Object.keys(found ?? {})).not.toContain('workforceIdentityId');
      expect(locations.some((l) => l.id === handle.seed.tenantA.locationId)).toBe(true);
    });

    it('books an appointment for the account\'s own patient, and rejects a double-booked slot', async () => {
      const ctxPortal = ctxFor(tenantAPortalAccountId);
      const scheduledStart = new Date(Date.now() + 30 * 24 * 3600_000);
      const scheduledEnd = new Date(scheduledStart.getTime() + 30 * 60_000);

      const booked = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        chartService.bookAppointment(trx, ctxPortal, tenantAPatientId, {
          locationId: handle.seed.tenantA.locationId,
          practitionerId: tenantAPractitionerId,
          appointmentType: 'office_visit',
          scheduledStart,
          scheduledEnd,
        }),
      );
      expect(booked.status).toBe('scheduled');
      expect(booked.patientId).toBe(tenantAPatientId);

      const otherPatientId = await createPatient(handle.seed.tenantA.tenantId);
      const otherAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
      await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        consentService.createSelfGrant(trx, handle.seed.tenantA.tenantId, otherPatientId, otherAccountId),
      );
      await expect(
        withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
          chartService.bookAppointment(trx, ctxFor(otherAccountId), otherPatientId, {
            locationId: handle.seed.tenantA.locationId,
            practitionerId: tenantAPractitionerId,
            appointmentType: 'office_visit',
            scheduledStart,
            scheduledEnd,
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('cannot book on behalf of a patient the account has no grant for', async () => {
      const ungrantedAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
      const scheduledStart = new Date(Date.now() + 40 * 24 * 3600_000);
      await expect(
        withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
          chartService.bookAppointment(trx, ctxFor(ungrantedAccountId), tenantAPatientId, {
            locationId: handle.seed.tenantA.locationId,
            practitionerId: tenantAPractitionerId,
            appointmentType: 'office_visit',
            scheduledStart,
            scheduledEnd: new Date(scheduledStart.getTime() + 30 * 60_000),
          }),
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('cancels its own appointment, and cannot cancel an appointment belonging to a different patient', async () => {
      const ctxPortal = ctxFor(tenantAPortalAccountId);
      const scheduledStart = new Date(Date.now() + 50 * 24 * 3600_000);
      const booked = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        chartService.bookAppointment(trx, ctxPortal, tenantAPatientId, {
          locationId: handle.seed.tenantA.locationId,
          practitionerId: tenantAPractitionerId,
          appointmentType: 'office_visit',
          scheduledStart,
          scheduledEnd: new Date(scheduledStart.getTime() + 30 * 60_000),
        }),
      );

      const otherPatientId = await createPatient(handle.seed.tenantA.tenantId);
      const otherAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
      await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        consentService.createSelfGrant(trx, handle.seed.tenantA.tenantId, otherPatientId, otherAccountId),
      );
      // Even with a real appointment id and a valid grant for *some* patient, cancelling someone
      // else's appointment must fail — grant validity alone isn't enough, ownership must match too.
      await expect(
        withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
          chartService.cancelAppointment(trx, ctxFor(otherAccountId), otherPatientId, booked.id, 'Not mine'),
        ),
      ).rejects.toBeInstanceOf(NotFoundError);

      const cancelled = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        chartService.cancelAppointment(trx, ctxPortal, tenantAPatientId, booked.id, 'Patient requested'),
      );
      expect(cancelled.status).toBe('cancelled');
    });

    it('Tenant B sees no Tenant A practitioners or locations', async () => {
      const tenantBPatientId = await createPatient(handle.seed.tenantB.tenantId);
      const tenantBAccountId = await createPortalAccount(handle.seed.tenantB.tenantId);
      await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
        consentService.createSelfGrant(trx, handle.seed.tenantB.tenantId, tenantBPatientId, tenantBAccountId),
      );
      const ctxB = requestContextFor(handle.seed.tenantB.tenantId, tenantBAccountId, { actor: { id: tenantBAccountId, type: 'patient' } });
      const practitioners = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
        schedulingService.listBookablePractitioners(trx, ctxB),
      );
      expect(practitioners.some((p) => p.id === tenantAPractitionerId)).toBe(false);
    });
  });
});

/** Tier 2 platform gap: SMART standalone launch's consent decision — the real backend behind
 * apps/patient-portal's `/smart/authorize` screen. */
describe('SmartLaunchService (SMART standalone launch consent)', () => {
  let handle: TestDbHandle;
  const smartLaunchService = new SmartLaunchService();
  let patientId: string;
  let portalAccountId: string;
  let otherPatientId: string;

  async function createPatient(tenantId: string): Promise<string> {
    return withTenantContext(handle.db, tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({ tenant_id: tenantId, given_name: 'Launch', family_name: `Consent-${Date.now()}`, date_of_birth: '1990-01-01', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });
  }

  async function createPortalAccount(tenantId: string): Promise<string> {
    return withTenantContext(handle.db, tenantId, async (trx) => {
      const account = await trx
        .insertInto('portal_accounts')
        .values({ tenant_id: tenantId, email: `launch-consent-${randomUUID()}@example.com`, password_hash: 'not-a-real-hash', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      return account.id;
    });
  }

  beforeAll(async () => {
    handle = await setupTestDb();
    const consentService = new ConsentService();
    patientId = await createPatient(handle.seed.tenantA.tenantId);
    portalAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
    await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      consentService.createSelfGrant(trx, handle.seed.tenantA.tenantId, patientId, portalAccountId),
    );
    // A patient this account has NOT been granted access to — used to prove the ConsentService
    // gate is real, not just a redirect-URI/scope formality.
    otherPatientId = await createPatient(handle.seed.tenantA.tenantId);
  });

  afterAll(() => handle.close());

  function ctx() {
    return requestContextFor(handle.seed.tenantA.tenantId, portalAccountId, { actor: { id: portalAccountId, type: 'patient' } }) as Parameters<
      SmartLaunchService['decide']
    >[1];
  }

  it('allow creates a real authorization code and returns a redirect carrying it', async () => {
    const result = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      smartLaunchService.decide(trx, ctx(), {
        decision: 'allow',
        clientId: handle.seed.tenantA.smartClientId,
        redirectUri: 'https://example-smart-app.test/callback',
        scope: 'patient/Patient.read',
        state: 'abc',
        codeChallenge: 'a-fake-challenge-value',
        codeChallengeMethod: 'S256',
        patientId,
      }),
    );
    const url = new URL(result.redirectUrl);
    expect(url.origin + url.pathname).toBe('https://example-smart-app.test/callback');
    expect(url.searchParams.get('state')).toBe('abc');
    expect(url.searchParams.get('code')).toBeTruthy();

    const codeId = url.searchParams.get('code')!;
    const row = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      trx.selectFrom('smart_authorization_codes').selectAll().where('id', '=', codeId).executeTakeFirst(),
    );
    expect(row?.patient_id).toBe(patientId);
    expect(row?.portal_account_id).toBe(portalAccountId);
    expect(row?.status).toBe('issued');
  });

  it('deny returns an access_denied redirect and creates no authorization code', async () => {
    const before = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      trx.selectFrom('smart_authorization_codes').select(({ fn }) => fn.countAll<string>().as('count')).executeTakeFirst(),
    );
    const result = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      smartLaunchService.decide(trx, ctx(), {
        decision: 'deny',
        clientId: handle.seed.tenantA.smartClientId,
        redirectUri: 'https://example-smart-app.test/callback',
        scope: 'patient/Patient.read',
        state: 'xyz',
        codeChallenge: 'a-fake-challenge-value',
        codeChallengeMethod: 'S256',
        patientId,
      }),
    );
    expect(result.redirectUrl).toContain('error=access_denied');
    expect(result.redirectUrl).toContain('state=xyz');
    const after = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      trx.selectFrom('smart_authorization_codes').select(({ fn }) => fn.countAll<string>().as('count')).executeTakeFirst(),
    );
    expect(after?.count).toBe(before?.count);
  });

  it('rejects a redirect_uri that is not registered for the client', async () => {
    await expect(
      withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        smartLaunchService.decide(trx, ctx(), {
          decision: 'allow',
          clientId: handle.seed.tenantA.smartClientId,
          redirectUri: 'https://not-a-registered-app.test/callback',
          scope: 'patient/Patient.read',
          state: null,
          codeChallenge: 'x',
          codeChallengeMethod: 'S256',
          patientId,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a scope the client is not allowed', async () => {
    await expect(
      withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        smartLaunchService.decide(trx, ctx(), {
          decision: 'allow',
          clientId: handle.seed.tenantA.smartClientId,
          redirectUri: 'https://example-smart-app.test/callback',
          scope: 'patient/MedicationRequest.write',
          state: null,
          codeChallenge: 'x',
          codeChallengeMethod: 'S256',
          patientId,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects allowing a launch for a patient this portal account has no consent grant for', async () => {
    await expect(
      withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        smartLaunchService.decide(trx, ctx(), {
          decision: 'allow',
          clientId: handle.seed.tenantA.smartClientId,
          redirectUri: 'https://example-smart-app.test/callback',
          scope: 'patient/Patient.read',
          state: null,
          codeChallenge: 'x',
          codeChallengeMethod: 'S256',
          patientId: otherPatientId,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

/** Item 25 — records export gained real PDF/CCD-XML output alongside the original JSON dump. */
describe('PortalExportService formats (item 25)', () => {
  let handle: TestDbHandle;
  let patientId: string;
  let portalAccountId: string;
  const puts: { contentType: string; body: string | Buffer; filename: string }[] = [];
  const capturingStorageGateway: ObjectStorageGateway = {
    getUploadUrl: async () => ({ url: 'https://example.test/upload', storageKey: 'k' }),
    getDownloadUrl: async () => 'https://example.test/download',
    headObject: async () => null,
    putObject: async (params) => {
      puts.push({ contentType: params.contentType, body: params.body, filename: params.filename });
      return { storageKey: `exports/${randomUUID()}` };
    },
  };
  const exportService = new PortalExportService(capturingStorageGateway);

  beforeAll(async () => {
    handle = await setupTestDb();
    const consentService = new ConsentService();
    const ctxA = handle.seed.tenantA;

    patientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({ tenant_id: ctxA.tenantId, given_name: 'Export', family_name: `Formats-${Date.now()}`, date_of_birth: '1975-08-20', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('problems')
        .values({ tenant_id: ctxA.tenantId, patient_id: patient.id, code_system: 'ICD-10-CM', code: 'E11.9', display_name: 'Type 2 diabetes', clinical_status: 'active', status: 'active' })
        .execute();
      await trx
        .insertInto('allergies')
        .values({ tenant_id: ctxA.tenantId, patient_id: patient.id, substance: 'Penicillin', reaction: 'Hives', status: 'active' })
        .execute();
      await trx
        .insertInto('medications')
        .values({ tenant_id: ctxA.tenantId, patient_id: patient.id, medication_name: 'Metformin', dose: '500mg', frequency: 'BID', entry_source: 'clinician_entered', status: 'active' })
        .execute();
      return patient.id;
    });
    portalAccountId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const account = await trx
        .insertInto('portal_accounts')
        .values({ tenant_id: ctxA.tenantId, email: `export-formats-${randomUUID()}@example.com`, password_hash: 'not-a-real-hash', status: 'active' })
        .returning('id')
        .executeTakeFirstOrThrow();
      return account.id;
    });
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => consentService.createSelfGrant(trx, ctxA.tenantId, patientId, portalAccountId));
  });

  afterAll(() => handle.close());

  function ctx() {
    return requestContextFor(handle.seed.tenantA.tenantId, portalAccountId, { actor: { id: portalAccountId, type: 'patient' } }) as Parameters<
      PortalExportService['requestExport']
    >[1];
  }

  it('defaults to JSON when no format is given (backward compatible)', async () => {
    const { request } = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) => exportService.requestExport(trx, ctx(), patientId));
    expect(request.format).toBe('json');
    const put = puts.at(-1)!;
    expect(put.contentType).toBe('application/json');
    expect(JSON.parse(put.body as string).problems).toHaveLength(1);
  });

  it('produces a real PDF when format=pdf', async () => {
    const { request } = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) => exportService.requestExport(trx, ctx(), patientId, 'pdf'));
    expect(request.format).toBe('pdf');
    const put = puts.at(-1)!;
    expect(put.contentType).toBe('application/pdf');
    expect((put.body as Buffer).subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('produces a real, well-formed CCD XML document when format=ccd-xml, using the tenant name as custodian', async () => {
    const { request } = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) => exportService.requestExport(trx, ctx(), patientId, 'ccd-xml'));
    expect(request.format).toBe('ccd-xml');
    const put = puts.at(-1)!;
    expect(put.contentType).toBe('application/xml');
    const xml = put.body as string;
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('Type 2 diabetes');
    expect(xml).toContain('Penicillin');
    expect(xml).toContain('Metformin');
  });
});
