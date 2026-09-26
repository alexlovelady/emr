import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Kysely, Migrator, FileMigrationProvider, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Kysely's FileMigrationProvider does `import(props.path.join(migrationFolder, fileName))`
 * internally. On Windows, `path.join` produces a raw drive-letter path (e.g. `C:\...`), and
 * Node's ESM loader rejects that as an unsupported URL scheme — dynamic import() requires a
 * file:// URL there. This wrapper matches path.join's signature but returns a proper file URL,
 * while migrationFolder itself (used directly with fs.readdir, not through this) stays a plain
 * OS path. Harmless on POSIX, where a plain path and its file:// URL both happen to import fine.
 */
const migrationImportPath = {
  join: (...segments: string[]) => pathToFileURL(path.join(...segments)).href,
};

/**
 * Runs against DATABASE_URL — the bootstrap/owner connection — never APP_DATABASE_URL.
 * Migrations run DDL (CREATE TABLE, GRANT, role management) that the least-privileged ehr_app
 * role must not have permission to do; see migration 0001 and ADR-0001.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to run migrations (see .env.example).`);
  }
  return value;
}

async function main(): Promise<void> {
  const direction = process.argv[2] ?? 'up';
  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: requireEnv('DATABASE_URL') }),
    }),
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path: migrationImportPath,
      migrationFolder: path.join(__dirname, '..', 'migrations'),
    }),
  });

  const { error, results } =
    direction === 'down' ? await migrator.migrateDown() : await migrator.migrateToLatest();

  for (const result of results ?? []) {
    if (result.status === 'Success') {
      // eslint-disable-next-line no-console
      console.log(`[migrate] ${result.direction} ${result.migrationName}: OK`);
    } else if (result.status === 'Error') {
      console.error(`[migrate] ${result.direction} ${result.migrationName}: FAILED`);
    }
  }

  await db.destroy();

  if (error) {
    console.error('[migrate] failed:', error);
    process.exit(1);
  }

  if (!results || results.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[migrate] no pending migrations.');
  }
}

main().catch((err: unknown) => {
  console.error('[migrate] unexpected error:', err);
  process.exit(1);
});
