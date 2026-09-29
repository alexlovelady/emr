import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

type Executor = Kysely<DB> | Transaction<DB>;

export interface BackupRunRow {
  id: string;
  startedAt: Date;
  completedAt: Date | null;
  status: string;
  storageKey: string | null;
  sizeBytes: number | null;
  error: string | null;
}

/** `backup_runs` is a global system table (no tenant_id) — see migration 0051's doc comment. */
export class BackupRunRepository {
  async start(trx: Executor): Promise<BackupRunRow> {
    const row = await trx.insertInto('backup_runs').values({ status: 'running' }).returningAll().executeTakeFirstOrThrow();
    return toRow(row);
  }

  async succeed(trx: Executor, id: string, storageKey: string, sizeBytes: number): Promise<BackupRunRow> {
    const row = await trx
      .updateTable('backup_runs')
      .set({ status: 'succeeded', completed_at: new Date(), storage_key: storageKey, size_bytes: sizeBytes.toString() })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async fail(trx: Executor, id: string, error: string): Promise<BackupRunRow> {
    const row = await trx
      .updateTable('backup_runs')
      .set({ status: 'failed', completed_at: new Date(), error })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async listRecent(trx: Executor, limit: number = 20): Promise<BackupRunRow[]> {
    const rows = await trx.selectFrom('backup_runs').selectAll().orderBy('started_at', 'desc').limit(limit).execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['backup_runs']>): BackupRunRow {
  return {
    id: dbRow.id,
    startedAt: dbRow.started_at,
    completedAt: dbRow.completed_at,
    status: dbRow.status,
    storageKey: dbRow.storage_key,
    sizeBytes: dbRow.size_bytes === null ? null : Number(dbRow.size_bytes),
    error: dbRow.error,
  };
}
