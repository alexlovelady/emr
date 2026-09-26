import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { NotFoundError, ValidationError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { IntakeFormTemplateService } from '../src/template/template.service.js';
import { IntakeFormResponseService } from '../src/response/response.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — intake', () => {
  let handle: TestDbHandle;
  const templateService = new IntakeFormTemplateService();
  const responseService = new IntakeFormResponseService();
  let tenantATemplateId: string;
  let tenantAResponseId: string;
  let tenantAPatientId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);

    tenantAPatientId = await withTenantContext(handle.db, ctxA.tenantId, async (trx) => {
      const patient = await trx
        .insertInto('patients')
        .values({
          tenant_id: ctxA.tenantId,
          given_name: 'Isolation',
          family_name: `Intake-${Date.now()}`,
          date_of_birth: '1985-05-05',
          status: 'active',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return patient.id;
    });

    const template = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      templateService.create(trx, ctxA, {
        name: `Isolation Intake ${Date.now()}`,
        schema: [{ key: 'reason_for_visit', label: 'Reason for visit', type: 'text', required: true }],
      }),
    );
    tenantATemplateId = template.id;

    const response = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      responseService.create(trx, ctxA, { templateId: template.id, patientId: tenantAPatientId }),
    );
    tenantAResponseId = response.id;
  });

  afterAll(() => handle.close());

  it('Tenant B cannot read a Tenant A template by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => templateService.getById(trx, ctxB, tenantATemplateId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Tenant B cannot read a Tenant A response by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => responseService.getById(trx, ctxB, tenantAResponseId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Row-Level Security blocks a query with no tenant_id predicate at all', async () => {
    const rows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('intake_form_responses').selectAll().where('id', '=', tenantAResponseId).execute(),
    );
    expect(rows).toHaveLength(0);
  });

  it('rejects submission missing a required field', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => responseService.submit(trx, ctxA, tenantAResponseId, {})),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('accepts a complete submission', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const submitted = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      responseService.submit(trx, ctxA, tenantAResponseId, { reason_for_visit: 'Annual checkup' }),
    );
    expect(submitted.status).toBe('submitted');
  });
});
