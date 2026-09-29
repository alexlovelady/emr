import type { Kysely } from 'kysely';
import type { DB } from '@ehr/db';
import type { NotificationGateway } from '@ehr/notification-adapter';
import { AlertRepository } from './alert.repository.js';
import type { AlertRule } from './alert.types.js';

export interface AlertEvaluatorOptions {
  /** Where a newly-opened alert's notification is sent. Omitted disables notification dispatch
   * entirely — evaluation and persistence (the `alerts` table itself, readable via the admin UI)
   * still happen either way. */
  notifyEmail?: string;
}

/**
 * Item 18 of the post-Tier-2 gap sweep: `packages/observability` had real OpenTelemetry metrics
 * scaffolding with nothing wired to act on it. Runs every registered `AlertRule` against the
 * current database state, upserts one open `alerts` row per distinct finding (deduped by
 * rule+condition, so re-evaluating an already-firing condition updates the SAME row instead of
 * spamming new ones), auto-resolves an open alert whose rule no longer reports that finding, and
 * dispatches exactly one notification — via the same `NotificationGateway`/`NoopNotificationGateway`
 * every other vendor boundary in this codebase already stubs — the moment an alert newly opens, not
 * on every re-evaluation of one that's already open (an ongoing condition pages once, not every
 * tick).
 */
export class AlertEvaluator {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly rules: AlertRule[],
    private readonly notificationGateway: NotificationGateway,
    private readonly alertRepo: AlertRepository = new AlertRepository(),
    private readonly options: AlertEvaluatorOptions = {},
  ) {}

  async evaluate(): Promise<void> {
    for (const rule of this.rules) {
      await this.evaluateRule(rule);
    }
  }

  private async evaluateRule(rule: AlertRule): Promise<void> {
    let findings;
    try {
      findings = await rule.evaluate(this.db);
    } catch (err) {
      console.error(`[AlertEvaluator] rule "${rule.key}" failed to evaluate — skipping this tick:`, err);
      return;
    }

    for (const finding of findings) {
      const { isNew } = await this.alertRepo.upsertOpen(this.db, finding);
      if (isNew && this.options.notifyEmail) {
        await this.notificationGateway
          .sendEmail({
            to: this.options.notifyEmail,
            subject: `[EHR ALERT] ${finding.title}`,
            body: `Rule: ${rule.key}\nSeverity: ${finding.severity}\n\n${JSON.stringify(finding.detail, null, 2)}`,
          })
          .catch((err: unknown) => console.error(`[AlertEvaluator] failed to send notification for "${finding.title}":`, err));
      }
    }

    await this.alertRepo.resolveStale(
      this.db,
      rule.key,
      findings.map((f) => f.dedupeKey),
    );
  }
}
