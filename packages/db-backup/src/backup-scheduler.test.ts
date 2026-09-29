import { describe, expect, it, vi } from 'vitest';
import { BackupScheduler } from './backup-scheduler.js';
import type { DatabaseBackupJob } from './database-backup-job.js';

describe('BackupScheduler', () => {
  it('runs one backup immediately on start(), then again each interval', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue({ id: 'x', status: 'succeeded' });
    const job = { run } as unknown as DatabaseBackupJob;
    const scheduler = new BackupScheduler(job, { intervalMs: 1000 });

    scheduler.start();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('does not crash the process when a run() rejects outright (e.g. a bug outside its own try/catch)', async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unhandledRejection = vi.fn();
    process.once('unhandledRejection', unhandledRejection);

    const run = vi.fn().mockRejectedValue(new Error('unexpected'));
    const job = { run } as unknown as DatabaseBackupJob;
    const scheduler = new BackupScheduler(job, { intervalMs: 1000 });

    scheduler.start();
    await Promise.resolve();
    await Promise.resolve();
    scheduler.stop();

    expect(unhandledRejection).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
    vi.useRealTimers();
  });

  it('skips an overlapping tick while a run is still in flight', async () => {
    vi.useFakeTimers();
    let resolveRun: (() => void) | undefined;
    const run = vi.fn().mockImplementation(
      () =>
        new Promise<{ id: string; status: string }>((resolve) => {
          resolveRun = () => resolve({ id: 'x', status: 'succeeded' });
        }),
    );
    const job = { run } as unknown as DatabaseBackupJob;
    const scheduler = new BackupScheduler(job, { intervalMs: 1000 });

    scheduler.start();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);

    resolveRun?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    scheduler.stop();
    vi.useRealTimers();
  });
});
