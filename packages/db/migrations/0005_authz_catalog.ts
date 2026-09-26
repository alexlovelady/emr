import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Role/permission catalog per EHR_BUILD_SPEC.md §6.2. `roles` and `role_permissions` are global
 * system catalogs (no tenant_id, no RLS) — seeded once (packages/db/seeds), not tenant-managed in
 * Phase 1. `user_roles` (the actual grant of a role to a user) IS tenant-scoped and RLS-enabled.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('roles')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('key', 'text', (col) => col.notNull().unique())
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addColumn('is_system', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('role_permissions')
    .addColumn('role_id', 'uuid', (col) => col.notNull())
    .addColumn('permission_key', 'text', (col) => col.notNull())
    .addForeignKeyConstraint('role_permissions_role_fk', ['role_id'], 'roles', ['id'])
    .addPrimaryKeyConstraint('role_permissions_pk', ['role_id', 'permission_key'])
    .execute();

  await withCommonColumns(db.schema.createTable('user_roles'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('role_id', 'uuid', (col) => col.notNull())
    .addColumn('location_id', 'uuid')
    .addColumn('granted_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('granted_by', 'uuid')
    .addColumn('revoked_at', 'timestamptz')
    .addForeignKeyConstraint('user_roles_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('user_roles_user_fk', ['user_id'], 'users', ['id'])
    .addForeignKeyConstraint('user_roles_role_fk', ['role_id'], 'roles', ['id'])
    .addForeignKeyConstraint('user_roles_location_fk', ['location_id'], 'locations', ['id'])
    .execute();
  await sql`create index user_roles_tenant_idx on user_roles (tenant_id)`.execute(db);
  await sql`create index user_roles_user_idx on user_roles (user_id, revoked_at)`.execute(db);
  await enableTenantIsolation(db, 'user_roles');

  // Deferred from migration 0004 — practitioner_roles.role_id could not reference `roles` before
  // this migration created it.
  await sql`
    alter table practitioner_roles
      add constraint practitioner_roles_role_fk foreign key (role_id) references roles (id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table practitioner_roles drop constraint if exists practitioner_roles_role_fk`.execute(db);
  await db.schema.dropTable('user_roles').ifExists().execute();
  await db.schema.dropTable('role_permissions').ifExists().execute();
  await db.schema.dropTable('roles').ifExists().execute();
}
