import type { DatabaseBackupJob } from './database-backup-job.js';

export interface BackupSchedulerOptions {
  intervalMs: number;
}

/**
 * A periodic trigger, not a queue-polling relay (unlike `OutboxRelay`/`BulkExportRelay` — there's
 * no per-request table to drain, just "run a full backup every `intervalMs`"). Runs one backup
 * immediately on `start()` so a freshly-deployed worker doesn't wait a full interval before the
 * first backup exists, then on the configured interval after that.
 */
export class BackupScheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly job: DatabaseBackupJob,
    private readonly options: BackupSchedulerOptions,
  ) {}

  start(): void {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private tick(): void {
    if (this.running) return;
    this.running = true;
    this.job
      .run()
      .catch((err: unknown) => {
        console.error('[BackupScheduler] backup run failed unexpectedly (outside DatabaseBackupJob.run()’s own try/catch):', err);
      })
      .finally(() => {
        this.running = false;
      });
  }
}
