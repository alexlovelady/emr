import { Kysely, sql } from 'kysely';

/**
 * Creates the least-privileged `ehr_app` role the application connects as (APP_DATABASE_URL).
 * This is deliberately NOT the migration/bootstrap connection's role (DATABASE_URL, the table
 * owner) — Postgres Row-Level Security is bypassed by table owners and superusers by default, so
 * if the app connected as the owner, every RLS policy added by later migrations would silently
 * do nothing. See ADR-0001 for the full rationale (this matters especially on Railway, whose
 * provisioned Postgres user is effectively the database owner).
 *
 * Requires the connecting (bootstrap) role to have CREATEROLE. If it doesn't (some managed
 * Postgres providers restrict this), this migration logs a loud warning and continues rather
 * than hard-failing local/CI runs — but RLS provides no real protection until the role exists,
 * so treat that warning as a release blocker, not noise.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create extension if not exists pgcrypto`.execute(db);
  await sql`create extension if not exists citext`.execute(db);

  const appPassword = resolveAppPassword();
  const passwordLiteral = escapeStringLiteral(appPassword);

  try {
    await sql
      .raw(
        `
        do $$
        begin
          if not exists (select from pg_roles where rolname = 'ehr_app') then
            create role ehr_app login password ${passwordLiteral};
          else
            alter role ehr_app password ${passwordLiteral};
          end if;
        end
        $$;
        `,
      )
      .execute(db);

    await sql`grant usage on schema public to ehr_app`.execute(db);
    await sql`alter default privileges in schema public grant select, insert, update, delete on tables to ehr_app`.execute(
      db,
    );
    await sql`alter default privileges in schema public grant usage, select on sequences to ehr_app`.execute(db);
  } catch (err) {
    console.warn(
      '[migration 0001_extensions_and_app_role] Could not create/configure the ehr_app role ' +
        '(likely missing CREATEROLE on the connecting/bootstrap user — common on some managed ' +
        'Postgres providers). Row-Level Security will NOT protect against the application ' +
        'connecting as the table owner until this is fixed manually — see ADR-0001. ' +
        `Original error: ${String(err)}`,
    );
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop owned by ehr_app`.execute(db).catch(() => undefined);
  await sql`drop role if exists ehr_app`.execute(db).catch(() => undefined);
  await sql`drop extension if exists citext`.execute(db);
  await sql`drop extension if exists pgcrypto`.execute(db);
}

function resolveAppPassword(): string {
  const explicit = process.env.EHR_APP_DB_PASSWORD;
  if (explicit) return explicit;

  const appUrl = process.env.APP_DATABASE_URL;
  if (appUrl) {
    try {
      const parsed = new URL(appUrl);
      // URL.password is percent-encoded as it appears in the string; decode it so a password
      // containing URL-special characters (@, :, /, %) round-trips correctly.
      if (parsed.password) return decodeURIComponent(parsed.password);
    } catch {
      // fall through to the error below
    }
  }
  throw new Error(
    'Cannot provision the ehr_app role: set EHR_APP_DB_PASSWORD or include a password in ' +
      'APP_DATABASE_URL before running migrations.',
  );
}

/** Standard Postgres single-quote escaping for embedding a literal in DDL (see file comment). */
function escapeStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
