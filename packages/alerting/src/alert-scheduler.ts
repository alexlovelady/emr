import type { AlertEvaluator } from './alert-evaluator.js';

export interface AlertSchedulerOptions {
  intervalMs: number;
}

/**
 * A periodic trigger, not a queue-polling relay — same reasoning as `packages/db-backup`'s
 * `BackupScheduler`: there's no per-request table to drain, just "evaluate every rule every
 * `intervalMs`." Runs one evaluation immediately on `start()` so a freshly-deployed worker doesn't
 * wait a full interval before the first alert sweep happens.
 */
export class AlertScheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly evaluator: AlertEvaluator,
    private readonly options: AlertSchedulerOptions,
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
    this.evaluator
      .evaluate()
      .catch((err: unknown) => {
        console.error("[AlertScheduler] evaluation failed unexpectedly (outside AlertEvaluator's own try/catch):", err);
      })
      .finally(() => {
        this.running = false;
      });
  }
}
