import type { AlertFinding, AlertRule } from '../alert.types.js';

export interface OutboxBacklogRuleOptions {
  lagThresholdSeconds: number;
}

/**
 * Wires `apps/worker`'s existing `outbox_relay_lag_seconds`/`outbox_pending_count` OTel gauges —
 * measured on every collection tick but never acted on — to a real alert, using the exact same
 * "oldest pending row's age" query those gauges' own collection callbacks already run.
 */
export function createOutboxBacklogRule(options: OutboxBacklogRuleOptions): AlertRule {
  return {
    key: 'outbox_backlog',
    description: 'Alerts when the oldest pending outbox_events row has been waiting longer than the configured threshold.',
    async evaluate(db): Promise<AlertFinding[]> {
      const oldestPending = await db
        .selectFrom('outbox_events')
        .select('created_at')
        .where('status', '=', 'pending')
        .orderBy('created_at', 'asc')
        .limit(1)
        .executeTakeFirst();
      if (!oldestPending) return [];

      const lagSeconds = (Date.now() - oldestPending.created_at.getTime()) / 1000;
      if (lagSeconds <= options.lagThresholdSeconds) return [];

      const pendingCountRow = await db
        .selectFrom('outbox_events')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .where('status', '=', 'pending')
        .executeTakeFirst();

      return [
        {
          ruleKey: 'outbox_backlog',
          dedupeKey: 'outbox-backlog',
          severity: 'warning',
          title: 'Outbox relay is falling behind',
          detail: { lagSeconds, pendingCount: Number(pendingCountRow?.count ?? 0) },
        },
      ];
    },
  };
}
