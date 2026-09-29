import type { AlertFinding, AlertRule } from '../alert.types.js';

export interface BackupHealthRuleOptions {
  staleThresholdMs: number;
}

/**
 * Closes the exact gap `packages/db-backup`'s own doc comments left open: a scheduled backup job
 * exists (item 17), but nothing ever looked at whether it was actually succeeding — a silently
 * broken nightly backup would otherwise go unnoticed until an actual restore was needed.
 */
export function createBackupHealthRule(options: BackupHealthRuleOptions): AlertRule {
  return {
    key: 'backup_health',
    description: 'Alerts when the most recent scheduled backup failed, or no backup has succeeded recently.',
    async evaluate(db): Promise<AlertFinding[]> {
      const mostRecent = await db.selectFrom('backup_runs').selectAll().orderBy('started_at', 'desc').limit(1).executeTakeFirst();
      // No backup has ever run yet (e.g. BackupScheduler hasn't ticked once) — nothing to alert on.
      if (!mostRecent) return [];

      if (mostRecent.status === 'failed') {
        return [
          {
            ruleKey: 'backup_health',
            dedupeKey: 'backup-failed',
            severity: 'critical',
            title: 'Scheduled database backup failed',
            detail: { backupRunId: mostRecent.id, startedAt: mostRecent.started_at.toISOString(), error: mostRecent.error },
          },
        ];
      }

      const mostRecentSucceeded = await db
        .selectFrom('backup_runs')
        .selectAll()
        .where('status', '=', 'succeeded')
        .orderBy('completed_at', 'desc')
        .limit(1)
        .executeTakeFirst();
      // Never succeeded and not currently failed (e.g. still 'running') — the 'failed' branch
      // above already covers an actual failure; nothing stale to report yet.
      if (!mostRecentSucceeded?.completed_at) return [];

      const ageMs = Date.now() - mostRecentSucceeded.completed_at.getTime();
      if (ageMs <= options.staleThresholdMs) return [];

      return [
        {
          ruleKey: 'backup_health',
          dedupeKey: 'backup-stale',
          severity: 'warning',
          title: 'No successful database backup recently',
          detail: { lastSucceededAt: mostRecentSucceeded.completed_at.toISOString(), ageMs },
        },
      ];
    },
  };
}
