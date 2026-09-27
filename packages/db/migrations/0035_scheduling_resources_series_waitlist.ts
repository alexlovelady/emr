import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Phase I (eCW/athena parity roadmap): multi-resource scheduling, recurring appointment series,
 * and a waitlist status — see the plan file history for full scope.
 *
 * `recurrence_rule` is denormalized onto every appointment row in a series (not a separate
 * `appointment_series` table) — it's informational/debugging context, not something queried by
 * itself; `series_id` is the actual correlation key used to list/cancel a whole series.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('resources'))
    .addColumn('location_id', 'uuid', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('resource_type', 'text', (col) => col.notNull())
    .addForeignKeyConstraint('resources_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('resources_location_fk', ['location_id'], 'locations', ['id'])
    .execute();
  await sql`create index resources_tenant_idx on resources (tenant_id)`.execute(db);
  await sql`create index resources_location_idx on resources (location_id)`.execute(db);
  await enableTenantIsolation(db, 'resources');

  // A pure join table (role_permissions-style), not withCommonColumns — appointment_resources has
  // no independent lifecycle of its own beyond "does this link exist," but it IS tenant-scoped
  // (PHI-adjacent, unlike role_permissions' global system catalog), so it still needs its own
  // tenant_id column + RLS policy rather than relying on a join to a tenant-scoped parent.
  await db.schema
    .createTable('appointment_resources')
    .addColumn('tenant_id', 'uuid', (col) => col.notNull())
    .addColumn('appointment_id', 'uuid', (col) => col.notNull())
    .addColumn('resource_id', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint('appointment_resources_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('appointment_resources_appointment_fk', ['appointment_id'], 'appointments', ['id'])
    .addForeignKeyConstraint('appointment_resources_resource_fk', ['resource_id'], 'resources', ['id'])
    .addPrimaryKeyConstraint('appointment_resources_pk', ['appointment_id', 'resource_id'])
    .execute();
  await sql`create index appointment_resources_resource_idx on appointment_resources (resource_id)`.execute(db);
  await enableTenantIsolation(db, 'appointment_resources');

  await db.schema
    .alterTable('appointments')
    .addColumn('series_id', 'uuid')
    .addColumn('recurrence_rule', 'jsonb')
    .addColumn('waitlisted_at', 'timestamptz')
    .execute();
  await sql`create index appointments_series_idx on appointments (series_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('appointment_resources').ifExists().execute();
  await db.schema.dropTable('resources').ifExists().execute();
  await db.schema
    .alterTable('appointments')
    .dropColumn('series_id')
    .dropColumn('recurrence_rule')
    .dropColumn('waitlisted_at')
    .execute();
}
