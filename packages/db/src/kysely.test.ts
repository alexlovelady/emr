import { describe, expect, it, vi } from 'vitest';
import { withTenantContext } from './kysely.js';
import type { Kysely } from 'kysely';
import type { DB } from './types.js';

describe('withTenantContext', () => {
  it('rejects a non-UUID tenantId before ever opening a transaction', async () => {
    const fakeDb = { transaction: vi.fn() } as unknown as Kysely<DB>;

    await expect(withTenantContext(fakeDb, 'not-a-uuid', async () => 'unreachable')).rejects.toThrow(TypeError);
    expect(fakeDb.transaction).not.toHaveBeenCalled();
  });

  // The happy path (transaction opened, `set_config('app.tenant_id', ...)` run, RLS actually
  // enforced) needs a real Postgres connection to mean anything — see the src/*.integration.test.ts
  // suite (packages/testing's tenant-isolation harness) rather than mocking Kysely's internals here.
});
