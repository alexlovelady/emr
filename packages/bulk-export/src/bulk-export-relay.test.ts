import { describe, expect, it, vi } from 'vitest';
import { BulkExportRelay, describeError } from './bulk-export-relay.js';
import type { ObjectStorageGateway } from '@ehr/object-storage';

describe('describeError', () => {
  it('unwraps an AggregateError (e.g. a multi-address connection failure) rather than returning its empty top-level message', () => {
    const inner1 = new Error('connect ECONNREFUSED ::1:9000');
    const inner2 = new Error('connect ECONNREFUSED 127.0.0.1:9000');
    const aggregate = new AggregateError([inner1, inner2], '');
    expect(describeError(aggregate)).toBe('connect ECONNREFUSED ::1:9000; connect ECONNREFUSED 127.0.0.1:9000');
  });

  it('returns a plain Error message as-is', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('falls back to String() for a non-Error thrown value', () => {
    expect(describeError('a plain string throw')).toBe('a plain string throw');
  });
});

describe('BulkExportRelay.start', () => {
  it('does not crash the process when a tick rejects (e.g. DB temporarily unreachable)', async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unhandledRejection = vi.fn();
    process.once('unhandledRejection', unhandledRejection);

    const failingDb = {
      selectFrom: () => {
        throw new Error('ECONNREFUSED');
      },
    } as never;
    const objectStorage: ObjectStorageGateway = {
      getUploadUrl: vi.fn(),
      getDownloadUrl: vi.fn(),
      headObject: vi.fn(),
      putObject: vi.fn(),
    };
    const relay = new BulkExportRelay(failingDb, objectStorage, { pollIntervalMs: 10, fhirBaseUrl: 'http://localhost:3200/fhir/r4' });

    relay.start();
    await vi.advanceTimersByTimeAsync(10);
    relay.stop();

    await Promise.resolve();

    expect(unhandledRejection).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[BulkExportRelay] tick failed, will retry next interval:', expect.any(Error));

    errorSpy.mockRestore();
    vi.useRealTimers();
  });
});
