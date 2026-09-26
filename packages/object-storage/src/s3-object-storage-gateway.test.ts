import { describe, expect, it } from 'vitest';
import { buildStorageKey } from './s3-object-storage-gateway.js';

describe('buildStorageKey', () => {
  it('prefixes the key with tenants/<tenantId>/documents/', () => {
    const key = buildStorageKey('11111111-1111-1111-1111-111111111111', 'chart.pdf');
    expect(key).toMatch(/^tenants\/11111111-1111-1111-1111-111111111111\/documents\/[0-9a-f-]{36}-chart\.pdf$/);
  });

  it('sanitizes unsafe characters out of the filename', () => {
    const key = buildStorageKey('t1', '../../etc/passwd; rm -rf /.txt');
    expect(key).not.toMatch(/[/](?!documents\/)\.\./);
    expect(key.split('/').pop()).not.toContain('/');
  });

  it('truncates very long filenames', () => {
    const key = buildStorageKey('t1', 'a'.repeat(500) + '.txt');
    expect(key.length).toBeLessThan(300);
  });
});
