import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext } from '@ehr/db';
import { ConflictError, NotFoundError } from '@ehr/domain-common';
import { setupTestDb, requestContextFor, type TestDbHandle } from '@ehr/testing';
import { TaskService } from '../src/task/task.service.js';

/** EHR_BUILD_SPEC.md §18.2 — run via `pnpm test:tenant-isolation`, requires a live Postgres. */
describe('tenant isolation — tasks', () => {
  let handle: TestDbHandle;
  const taskService = new TaskService();
  let tenantATaskId: string;

  beforeAll(async () => {
    handle = await setupTestDb();
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const task = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      taskService.create(trx, ctxA, {
        taskType: 'front_desk.callback',
        title: `Isolation test ${Date.now()}`,
        priority: 'normal',
      }),
    );
    tenantATaskId = task.id;
  });

  afterAll(() => handle.close());

  it('Tenant B cannot read a Tenant A task by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) => taskService.getById(trx, ctxB, tenantATaskId)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Tenant B cannot see Tenant A tasks in list()', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    const tasks = await withTenantContext(handle.db, ctxB.tenantId, (trx) => taskService.list(trx, ctxB));
    expect(tasks.some((t) => t.id === tenantATaskId)).toBe(false);
  });

  it('Row-Level Security blocks a query with no tenant_id predicate at all', async () => {
    const rows = await withTenantContext(handle.db, handle.seed.tenantB.tenantId, (trx) =>
      trx.selectFrom('tasks').selectAll().where('id', '=', tenantATaskId).execute(),
    );
    expect(rows).toHaveLength(0);
  });

  it('cannot complete an already-terminal task', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => taskService.complete(trx, ctxA, tenantATaskId));
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) => taskService.complete(trx, ctxA, tenantATaskId)),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('reassigns an open task to a different user', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const task = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      taskService.create(trx, ctxA, { taskType: 'front_desk.callback', title: `Reassign test ${Date.now()}`, priority: 'normal' }),
    );
    const reassigned = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      taskService.reassign(trx, ctxA, task.id, { assignedToUserId: handle.seed.tenantA.staffUserId }),
    );
    expect(reassigned.assignedToUserId).toBe(handle.seed.tenantA.staffUserId);
  });

  it('cannot reassign an already-terminal task', async () => {
    const ctxA = requestContextFor(handle.seed.tenantA.tenantId, handle.seed.tenantA.adminUserId);
    const task = await withTenantContext(handle.db, ctxA.tenantId, (trx) =>
      taskService.create(trx, ctxA, { taskType: 'front_desk.callback', title: `Reassign terminal test ${Date.now()}`, priority: 'normal' }),
    );
    await withTenantContext(handle.db, ctxA.tenantId, (trx) => taskService.cancel(trx, ctxA, task.id));
    await expect(
      withTenantContext(handle.db, ctxA.tenantId, (trx) =>
        taskService.reassign(trx, ctxA, task.id, { assignedToUserId: handle.seed.tenantA.staffUserId }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('Tenant B cannot reassign a Tenant A task by known UUID', async () => {
    const ctxB = requestContextFor(handle.seed.tenantB.tenantId, handle.seed.tenantB.adminUserId);
    await expect(
      withTenantContext(handle.db, ctxB.tenantId, (trx) =>
        taskService.reassign(trx, ctxB, tenantATaskId, { assignedToUserId: handle.seed.tenantB.staffUserId }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
