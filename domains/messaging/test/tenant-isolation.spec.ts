import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withTenantContext } from '@ehr/db';
import { NotFoundError } from '@ehr/domain-common';
import { ConsentService } from '@ehr/consent';
import type { NotificationGateway } from '@ehr/notification-adapter';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { MessageThreadService } from '../src/thread/message-thread.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — secure messaging', () => {
  let handle: TestDbHandle;
  const notificationGateway: NotificationGateway = { sendEmail: vi.fn(async () => undefined), sendSms: vi.fn(async () => undefined) };
  const service = new MessageThreadService(notificationGateway);
  const consentService = new ConsentService();

  let tenantAPatientId: string;
  let tenantAPortalAccountId: string;
  let tenantAThreadId: string;

  async function createPatient(tenantId: string): Promise<string> {
    return withTenantContext(handle.db, tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: tenantId,
          given_name: 'Messaging',
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

    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      consentService.createSelfGrant(trx, ctxA.tenantId, tenantAPatientId, tenantAPortalAccountId),
    );

    const thread = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      service.createThreadAsStaff(trx, ctxA, tenantAPatientId, { subject: 'Test result question', body: 'Hi, checking in.' }),
    );
    tenantAThreadId = thread.id;
  });

  afterAll(() => handle.close());

  it('a staff-authored thread notifies the self-grant portal account by email', async () => {
    expect(notificationGateway.sendEmail).toHaveBeenCalled();
  });

  it('the linked portal account can read the thread it has a grant for', async () => {
    const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, tenantAPortalAccountId, {
      actor: { id: tenantAPortalAccountId, type: 'patient' },
    });
    const messages = await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      service.listMessagesAsPortal(trx, ctxPortal, tenantAThreadId),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.senderType).toBe('staff');
  });

  it('a portal account with no grant for the patient is denied (404, not 403)', async () => {
    const ungrantedAccountId = await createPortalAccount(handle.seed.tenantA.tenantId);
    const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, ungrantedAccountId, {
      actor: { id: ungrantedAccountId, type: 'patient' },
    });
    await expect(
      withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) => service.listMessagesAsPortal(trx, ctxPortal, tenantAThreadId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a grant-holding portal account can reply, and staff sees the reply', async () => {
    const ctxPortal = requestContextFor(handle.seed.tenantA.tenantId, tenantAPortalAccountId, {
      actor: { id: tenantAPortalAccountId, type: 'patient' },
    });
    await withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
      service.replyAsPortal(trx, ctxPortal, tenantAThreadId, { body: "I'm feeling fine, thanks." }),
    );

    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const messages = await withTenantContext(handle.db, ctxA.tenantId, (trx) => service.listMessagesAsStaff(trx, ctxA, tenantAThreadId));
    expect(messages).toHaveLength(2);
    expect(messages[1]?.senderType).toBe('portal');
  });

  it('Tenant B staff cannot read a Tenant A thread by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => service.listMessagesAsStaff(trx, ctxB, tenantAThreadId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a staff token (actor.type "user") cannot be used on a portal-facing service method', async () => {
    const ctxStaffMisusedAsPortal = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await expect(
      withTenantContext(handle.db, handle.seed.tenantA.tenantId, (trx) =>
        service.listMessagesAsPortal(trx, ctxStaffMisusedAsPortal, tenantAThreadId),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
