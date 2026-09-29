import type { Kysely } from 'kysely';
import type { DB } from '@ehr/db';

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'open' | 'resolved';

/**
 * One evaluation-time condition. `dedupeKey` scopes what counts as "the same alert" within a rule
 * — a rule with a fixed single condition (e.g. `backup_health`) uses a constant string; a rule that
 * finds one condition per tenant (e.g. `hl7_dead_letter`) uses the tenant id, so each tenant gets
 * its own independently-opened/resolved alert rather than one alert shared across all of them.
 */
export interface AlertFinding {
  ruleKey: string;
  dedupeKey: string;
  severity: AlertSeverity;
  title: string;
  detail: Record<string, unknown>;
  /** Context only — `alerts` has no RLS/tenant isolation (see migration 0053's doc comment). */
  tenantId?: string;
}

/**
 * A fixed, in-code catalog entry (same shape as `domains/query`'s governed-query registry) —
 * `AlertEvaluator` runs every registered rule's `evaluate()` against the current database state
 * each tick. Must never throw for an expected "nothing wrong" outcome (return `[]` instead); an
 * actual thrown error is logged and skips just that rule for this tick, not the rest.
 */
export interface AlertRule {
  key: string;
  description: string;
  evaluate(db: Kysely<DB>): Promise<AlertFinding[]>;
}

export interface AlertRow {
  id: string;
  ruleKey: string;
  dedupeKey: string;
  severity: AlertSeverity;
  title: string;
  detail: Record<string, unknown>;
  status: AlertStatus;
  tenantId: string | null;
  openedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  updatedAt: Date;
}
