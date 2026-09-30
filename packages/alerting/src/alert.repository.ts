import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import type { AlertFinding, AlertRow } from './alert.types.js';

type Executor = Kysely<DB> | Transaction<DB>;

/** `alerts` is a global system table (no tenant_id RLS) — see migration 0053's doc comment. */
export class AlertRepository {
  /**
   * Opens a new alert for this rule+dedupeKey, or refreshes the existing open one (updated
   * severity/title/detail, e.g. a growing dead-letter count) if a real Postgres unique index
   * (`alerts_open_dedupe_idx`) already has an open row for it — that partial unique index, not an
   * application-level check-then-insert, is what actually prevents a duplicate open alert under
   * concurrent evaluation.
   */
  async upsertOpen(trx: Executor, finding: AlertFinding): Promise<{ alert: AlertRow; isNew: boolean }> {
    const existing = await trx
      .selectFrom('alerts')
      .selectAll()
      .where('rule_key', '=', finding.ruleKey)
      .where('dedupe_key', '=', finding.dedupeKey)
      .where('status', '=', 'open')
      .executeTakeFirst();

    if (existing) {
      const updated = await trx
        .updateTable('alerts')
        .set({
          severity: finding.severity,
          title: finding.title,
          detail: JSON.stringify(finding.detail),
          updated_at: new Date(),
        })
        .where('id', '=', existing.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return { alert: toRow(updated), isNew: false };
    }

    const created = await trx
      .insertInto('alerts')
      .values({
        rule_key: finding.ruleKey,
        dedupe_key: finding.dedupeKey,
        severity: finding.severity,
        title: finding.title,
        detail: JSON.stringify(finding.detail),
        tenant_id: finding.tenantId ?? null,
        status: 'open',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { alert: toRow(created), isNew: true };
  }

  /** Resolves every open alert for `ruleKey` whose `dedupe_key` is NOT in `stillOpenDedupeKeys` —
   * what `AlertEvaluator` calls after each rule's evaluation to auto-close an alert whose condition
   * has genuinely cleared, without an evaluator having to fetch-then-diff itself. */
  async resolveStale(trx: Executor, ruleKey: string, stillOpenDedupeKeys: string[]): Promise<void> {
    let query = trx
      .updateTable('alerts')
      .set({ status: 'resolved', resolved_at: new Date(), resolved_by: null, updated_at: new Date() })
      .where('rule_key', '=', ruleKey)
      .where('status', '=', 'open');
    if (stillOpenDedupeKeys.length > 0) {
      query = query.where('dedupe_key', 'not in', stillOpenDedupeKeys);
    }
    await query.execute();
  }

  /** Manual acknowledgement via the admin UI — `resolvedBy` is a real user id, unlike
   * `resolveStale`'s system-driven resolution. */
  async resolveById(trx: Executor, id: string, resolvedBy: string): Promise<AlertRow> {
    const row = await trx
      .updateTable('alerts')
      .set({ status: 'resolved', resolved_at: new Date(), resolved_by: resolvedBy, updated_at: new Date() })
      .where('id', '=', id)
      .where('status', '=', 'open')
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  /**
   * Item 2 (population-health care gaps): unlike `list()`, this always filters by the caller's own
   * `tenantId` — `alerts` has no RLS to enforce that automatically, and a care-gap finding's
   * `detail` carries a real `patientId`, so an unfiltered read would leak another tenant's
   * patient-linked findings. See `apps/api/src/care-gaps/care-gaps.controller.ts`'s doc comment.
   */
  async listOpenByTenantAndRuleKeys(trx: Executor, tenantId: string, ruleKeys: string[]): Promise<AlertRow[]> {
    const rows = await trx
      .selectFrom('alerts')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('rule_key', 'in', ruleKeys)
      .where('status', '=', 'open')
      .orderBy('opened_at', 'desc')
      .limit(500)
      .execute();
    return rows.map(toRow);
  }

  async list(trx: Executor, opts: { status?: 'open' | 'resolved'; limit?: number } = {}): Promise<AlertRow[]> {
    let query = trx
      .selectFrom('alerts')
      .selectAll()
      .orderBy('opened_at', 'desc')
      .limit(opts.limit ?? 100);
    if (opts.status) query = query.where('status', '=', opts.status);
    const rows = await query.execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['alerts']>): AlertRow {
  return {
    id: dbRow.id,
    ruleKey: dbRow.rule_key,
    dedupeKey: dbRow.dedupe_key,
    severity: dbRow.severity as AlertRow['severity'],
    title: dbRow.title,
    detail: dbRow.detail,
    status: dbRow.status as AlertRow['status'],
    tenantId: dbRow.tenant_id,
    openedAt: dbRow.opened_at,
    resolvedAt: dbRow.resolved_at,
    resolvedBy: dbRow.resolved_by,
    updatedAt: dbRow.updated_at,
  };
}
