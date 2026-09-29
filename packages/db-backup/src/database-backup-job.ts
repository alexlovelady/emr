import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Kysely } from 'kysely';
import type { DB } from '@ehr/db';
import type { ObjectStorageGateway } from '@ehr/object-storage';
import { BackupRunRepository, type BackupRunRow } from './backup-run.repository.js';

const execFileAsync = promisify(execFile);

/** Not a real tenant — a fixed namespace so backup archives land under their own prefix
 * (`tenants/_system_backups/exports/...`) rather than colliding with a real tenant's key space.
 * `ObjectStorageGateway.putObject()` always writes under its `exports` folder — see that
 * interface's own doc comment — so this is the only available disambiguator. */
const BACKUP_STORAGE_NAMESPACE = '_system_backups';

/** Same reasoning as `packages/bulk-export`'s `describeError()` — `execFile` failures and
 * `AggregateError`s both need unwrapping to get a useful message. */
export function describeError(err: unknown): string {
  if (err instanceof AggregateError) {
    const inner = err.errors.map((e) => (e instanceof Error ? e.message : String(e))).join('; ');
    return inner || err.message || err.name;
  }
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

export interface DatabaseBackupJobOptions {
  /** The bootstrap/owner connection string (DATABASE_URL) — a backup must capture every tenant's
   * data, which the tenant-scoped, RLS-enforcing `ehr_app` role cannot see all of. */
  connectionString: string;
  /** Defaults to `'pg_dump'` (resolved via PATH) — see `BACKUP_PG_DUMP_PATH` in @ehr/config. The
   * production worker image installs the `postgresql-client` package precisely so this resolves;
   * local dev environments without it installed will see a clear ENOENT, not a silent no-op. */
  pgDumpPath?: string;
}

/** Real `pg_dump` invocation, `-Fc` (custom format — compressed, and the only format `pg_restore`
 * can selectively restore from) capturing all of stdout as a Buffer. Exposed as a free function
 * (not a private method) so `DatabaseBackupJob`'s constructor can accept a fake for tests — no
 * automated test in this repo can depend on a real `pg_dump` binary existing on PATH (it doesn't
 * on a bare CI runner, only inside a Postgres server image), the same class of constraint that
 * keeps `packages/bulk-export`'s tests off a live MinIO. */
export async function dumpDatabase(connectionString: string, pgDumpPath: string): Promise<Buffer> {
  const { stdout } = await execFileAsync(pgDumpPath, ['-Fc', connectionString], {
    maxBuffer: 1024 * 1024 * 1024,
    encoding: 'buffer',
  });
  return stdout;
}

/**
 * Closes docs/runbooks/backup-restore.md's "Known gaps: no real backup schedule exists" — that
 * runbook proved the restore *mechanism* works; this is the missing periodic *trigger*. One run
 * dumps the entire database (every tenant, `-Fc` custom format) and uploads it to the same object
 * storage every other server-generated file in this repo already uses.
 */
export class DatabaseBackupJob {
  private readonly repo: BackupRunRepository;
  private readonly dumpFn: (connectionString: string, pgDumpPath: string) => Promise<Buffer>;

  constructor(
    private readonly db: Kysely<DB>,
    private readonly objectStorage: ObjectStorageGateway,
    private readonly options: DatabaseBackupJobOptions,
    repo: BackupRunRepository = new BackupRunRepository(),
    dumpFn: (connectionString: string, pgDumpPath: string) => Promise<Buffer> = dumpDatabase,
  ) {
    this.repo = repo;
    this.dumpFn = dumpFn;
  }

  async run(): Promise<BackupRunRow> {
    const run = await this.repo.start(this.db);
    try {
      const dump = await this.dumpFn(this.options.connectionString, this.options.pgDumpPath ?? 'pg_dump');
      const filename = `db-backup-${run.startedAt.toISOString().replace(/[:.]/g, '-')}.dump`;
      const { storageKey } = await this.objectStorage.putObject({
        tenantId: BACKUP_STORAGE_NAMESPACE,
        filename,
        contentType: 'application/octet-stream',
        body: dump,
      });
      return await this.repo.succeed(this.db, run.id, storageKey, dump.byteLength);
    } catch (err) {
      return this.repo.fail(this.db, run.id, describeError(err));
    }
  }
}
