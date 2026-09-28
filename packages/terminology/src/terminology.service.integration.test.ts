import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb, type TestDbHandle } from '@ehr/testing';
import { TerminologyService } from './terminology.service.js';

/**
 * `terminology_codes` is a global catalog with no tenant_id/RLS (see migration 0037's doc
 * comment), so unlike every other integration test in this repo, these queries run directly
 * against `handle.db` — no `withTenantContext` needed.
 */
describe('TerminologyService (integration)', () => {
  let handle: TestDbHandle;
  const service = new TerminologyService();
  const system = `test-system-${crypto.randomUUID()}`;

  beforeAll(async () => {
    handle = await setupTestDb();
    await handle.db
      .insertInto('terminology_codes')
      .values([
        { system, code: 'X01', display: 'Xylophonic fever', billable: true },
        { system, code: 'X02', display: 'Xylophonic fever, unspecified', billable: true },
        { system, code: 'X00', display: 'Xylophonic disorders', billable: false },
      ])
      .execute();
  });

  afterAll(async () => {
    // `terminology_codes` is global, persistent state (no tenant scoping to reset between runs),
    // so this must clean up its own rows or every re-run against the same dev DB leaves orphans
    // behind under a fresh random `system` — same lesson as Phase H's MFA integration test.
    await handle.db.deleteFrom('terminology_codes').where('system', '=', system).execute();
    await handle.close();
  });

  it('validateCode finds a real code and reports checked:true', async () => {
    const result = await service.validateCode(handle.db, system, 'X01');
    expect(result).toEqual({ valid: true, checked: true, display: 'Xylophonic fever' });
  });

  it('validateCode distinguishes an unknown code (checked) from an unloaded system (unchecked)', async () => {
    const unknownCode = await service.validateCode(handle.db, system, 'ZZ999');
    expect(unknownCode).toEqual({ valid: false, checked: true });

    const unloadedSystem = await service.validateCode(handle.db, `no-such-system-${crypto.randomUUID()}`, 'X01');
    expect(unloadedSystem).toEqual({ valid: false, checked: false });
  });

  it('searchConcepts matches by code prefix', async () => {
    const results = await service.searchConcepts(handle.db, system, 'X0');
    expect(results.map((r) => r.code).sort()).toEqual(['X01', 'X02']);
  });

  it('searchConcepts matches by display text', async () => {
    const results = await service.searchConcepts(handle.db, system, 'xylophonic fever');
    expect(results.map((r) => r.code).sort()).toEqual(['X01', 'X02']);
  });

  it('searchConcepts excludes non-billable rows', async () => {
    const results = await service.searchConcepts(handle.db, system, 'xylophonic disorders');
    expect(results).toHaveLength(0);
  });

  it('searchConcepts never returns another system’s codes', async () => {
    const results = await service.searchConcepts(handle.db, `no-such-system-${crypto.randomUUID()}`, 'xylophonic');
    expect(results).toHaveLength(0);
  });

  it('searchConcepts returns nothing for a blank query', async () => {
    expect(await service.searchConcepts(handle.db, system, '   ')).toEqual([]);
  });
});
