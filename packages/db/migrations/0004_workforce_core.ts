import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * User ─ WorkforceIdentity ─ Practitioner ─ PractitionerRole per EHR_BUILD_SPEC.md §5.2.
 *
 * practitioner_roles.role_id is added here without a foreign key — the `roles` catalog table is
 * created in migration 0005, which adds the constraint once it exists (`ALTER TABLE ... ADD
 * CONSTRAINT`). Keeping migrations in the plan's original order matters more than avoiding this
 * two-step FK, since operators read migration history sequentially.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('users'))
    .addColumn('email', 'citext', (col) => col.notNull())
    .addColumn('password_hash', 'text', (col) => col.notNull())
    .addColumn('password_algo', 'text', (col) => col.notNull().defaultTo('argon2id'))
    .addColumn('mfa_enrolled', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('mfa_method', 'text', (col) => col.notNull().defaultTo('none'))
    .addColumn('last_login_at', 'timestamptz')
    .addForeignKeyConstraint('users_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addUniqueConstraint('users_tenant_email_unique', ['tenant_id', 'email'])
    .execute();
  await sql`create index users_tenant_idx on users (tenant_id)`.execute(db);
  await enableTenantIsolation(db, 'users');

  await withCommonColumns(db.schema.createTable('workforce_identities'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('organization_id', 'uuid', (col) => col.notNull())
    .addColumn('employment_status', 'text', (col) => col.notNull().defaultTo('active'))
    .addColumn('effective_start', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('effective_end', 'timestamptz')
    .addForeignKeyConstraint('workforce_identities_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('workforce_identities_user_fk', ['user_id'], 'users', ['id'])
    .addForeignKeyConstraint('workforce_identities_org_fk', ['organization_id'], 'organizations', ['id'])
    .execute();
  await sql`create index workforce_identities_tenant_idx on workforce_identities (tenant_id)`.execute(db);
  await sql`create index workforce_identities_user_idx on workforce_identities (user_id)`.execute(db);
  await enableTenantIsolation(db, 'workforce_identities');

  await withCommonColumns(db.schema.createTable('practitioners'))
    .addColumn('workforce_identity_id', 'uuid', (col) => col.notNull())
    .addColumn('npi', 'text')
    .addColumn('taxonomy_code', 'text')
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addForeignKeyConstraint('practitioners_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('practitioners_workforce_identity_fk', ['workforce_identity_id'], 'workforce_identities', [
      'id',
    ])
    .execute();
  await sql`create index practitioners_tenant_idx on practitioners (tenant_id)`.execute(db);
  await enableTenantIsolation(db, 'practitioners');

  await withCommonColumns(db.schema.createTable('practitioner_roles'))
    .addColumn('practitioner_id', 'uuid', (col) => col.notNull())
    .addColumn('location_id', 'uuid', (col) => col.notNull())
    .addColumn('role_id', 'uuid', (col) => col.notNull()) // FK added in migration 0005
    .addColumn('effective_start', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('effective_end', 'timestamptz')
    .addForeignKeyConstraint('practitioner_roles_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('practitioner_roles_practitioner_fk', ['practitioner_id'], 'practitioners', ['id'])
    .addForeignKeyConstraint('practitioner_roles_location_fk', ['location_id'], 'locations', ['id'])
    .execute();
  await sql`create index practitioner_roles_tenant_idx on practitioner_roles (tenant_id)`.execute(db);
  await enableTenantIsolation(db, 'practitioner_roles');

  await withCommonColumns(db.schema.createTable('refresh_tokens'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('token_hash', 'text', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('revoked_at', 'timestamptz')
    .addForeignKeyConstraint('refresh_tokens_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('refresh_tokens_user_fk', ['user_id'], 'users', ['id'])
    .addUniqueConstraint('refresh_tokens_token_hash_unique', ['token_hash'])
    .execute();
  await sql`create index refresh_tokens_tenant_idx on refresh_tokens (tenant_id)`.execute(db);
  await sql`create index refresh_tokens_user_idx on refresh_tokens (user_id)`.execute(db);
  await enableTenantIsolation(db, 'refresh_tokens');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('refresh_tokens').ifExists().execute();
  await db.schema.dropTable('practitioner_roles').ifExists().execute();
  await db.schema.dropTable('practitioners').ifExists().execute();
  await db.schema.dropTable('workforce_identities').ifExists().execute();
  await db.schema.dropTable('users').ifExists().execute();
}
