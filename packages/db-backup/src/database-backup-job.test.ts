import { describe, expect, it, vi } from 'vitest';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { DatabaseBackupJob, describeError } from './database-backup-job.js';
import type { BackupRunRepository, BackupRunRow } from './backup-run.repository.js';

describe('describeError', () => {
  it('unwraps an AggregateError instead of returning its empty top-level message', () => {
    const aggregate = new AggregateError([new Error('connect ENOENT pg_dump')], '');
    expect(describeError(aggregate)).toBe('connect ENOENT pg_dump');
  });

  it('returns a plain Error message as-is', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('falls back to String() for a non-Error thrown value', () => {
    expect(describeError('a plain string throw')).toBe('a plain string throw');
  });
});

function fakeRun(overrides: Partial<BackupRunRow> = {}): BackupRunRow {
  return {
    id: 'run-1',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: null,
    status: 'running',
    storageKey: null,
    sizeBytes: null,
    error: null,
    ...overrides,
  };
}

describe('DatabaseBackupJob.run', () => {
  it('dumps, uploads, and records success — never touching a real pg_dump binary or object storage network', async () => {
    const startedRun = fakeRun();
    const repo = {
      start: vi.fn().mockResolvedValue(startedRun),
      succeed: vi.fn().mockResolvedValue(fakeRun({ status: 'succeeded', storageKey: 'tenants/_system_backups/exports/x.dump', sizeBytes: 4 })),
      fail: vi.fn(),
    } as unknown as BackupRunRepository;
    const objectStorage: ObjectStorageGateway = {
      getUploadUrl: vi.fn(),
      getDownloadUrl: vi.fn(),
      headObject: vi.fn(),
      putObject: vi.fn().mockResolvedValue({ storageKey: 'tenants/_system_backups/exports/x.dump' }),
    };
    const fakeDump = vi.fn().mockResolvedValue(Buffer.from('fake-dump-bytes'));

    const job = new DatabaseBackupJob({} as never, objectStorage, { connectionString: 'postgres://fake' }, repo, fakeDump);
    const result = await job.run();

    expect(fakeDump).toHaveBeenCalledWith('postgres://fake', 'pg_dump');
    expect(objectStorage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: '_system_backups', contentType: 'application/octet-stream' }),
    );
    expect(repo.succeed).toHaveBeenCalledWith({}, 'run-1', 'tenants/_system_backups/exports/x.dump', Buffer.byteLength('fake-dump-bytes'));
    expect(result.status).toBe('succeeded');
  });

  it('records failure (not a thrown exception) when pg_dump itself fails, e.g. ENOENT', async () => {
    const startedRun = fakeRun();
    const repo = {
      start: vi.fn().mockResolvedValue(startedRun),
      succeed: vi.fn(),
      fail: vi.fn().mockResolvedValue(fakeRun({ status: 'failed', error: "spawn pg_dump ENOENT" })),
    } as unknown as BackupRunRepository;
    const objectStorage: ObjectStorageGateway = {
      getUploadUrl: vi.fn(),
      getDownloadUrl: vi.fn(),
      headObject: vi.fn(),
      putObject: vi.fn(),
    };
    const failingDump = vi.fn().mockRejectedValue(new Error('spawn pg_dump ENOENT'));

    const job = new DatabaseBackupJob({} as never, objectStorage, { connectionString: 'postgres://fake' }, repo, failingDump);
    const result = await job.run();

    expect(objectStorage.putObject).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith({}, 'run-1', 'spawn pg_dump ENOENT');
    expect(result.status).toBe('failed');
  });

  it('records failure when the object storage upload itself fails (dump succeeded, upload did not)', async () => {
    const startedRun = fakeRun();
    const repo = {
      start: vi.fn().mockResolvedValue(startedRun),
      succeed: vi.fn(),
      fail: vi.fn().mockResolvedValue(fakeRun({ status: 'failed', error: 'connect ECONNREFUSED 127.0.0.1:9000' })),
    } as unknown as BackupRunRepository;
    const objectStorage: ObjectStorageGateway = {
      getUploadUrl: vi.fn(),
      getDownloadUrl: vi.fn(),
      headObject: vi.fn(),
      putObject: vi.fn().mockRejectedValue(new AggregateError([new Error('connect ECONNREFUSED 127.0.0.1:9000')], '')),
    };
    const fakeDump = vi.fn().mockResolvedValue(Buffer.from('fake-dump-bytes'));

    const job = new DatabaseBackupJob({} as never, objectStorage, { connectionString: 'postgres://fake' }, repo, fakeDump);
    const result = await job.run();

    expect(repo.fail).toHaveBeenCalledWith({}, 'run-1', 'connect ECONNREFUSED 127.0.0.1:9000');
    expect(result.status).toBe('failed');
  });
});
