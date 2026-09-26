import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Tenant / Organization / Location per EHR_BUILD_SPEC.md §5.2. `tenants` is the tenant root
 * itself and therefore has no tenant_id and no RLS policy (it uses the platform's own id as the
 * scoping key for everything else) — see packages/db's withSystemContext for how it's accessed.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('tenants'), { tenantScoped: false })
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('slug', sql`citext`, (col) => col.notNull().unique())
    .execute();

  await withCommonColumns(db.schema.createTable('organizations'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('npi', 'text')
    .addForeignKeyConstraint('organizations_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addUniqueConstraint('organizations_tenant_name_unique', ['tenant_id', 'name'])
    .execute();
  await sql`create index organizations_tenant_idx on organizations (tenant_id)`.execute(db);
  await enableTenantIsolation(db, 'organizations');

  await withCommonColumns(db.schema.createTable('locations'))
    .addColumn('organization_id', 'uuid', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('time_zone', 'text', (col) => col.notNull().defaultTo('America/New_York'))
    .addForeignKeyConstraint('locations_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('locations_organization_fk', ['organization_id'], 'organizations', ['id'])
    .addUniqueConstraint('locations_organization_name_unique', ['organization_id', 'name'])
    .execute();
  await sql`create index locations_tenant_idx on locations (tenant_id)`.execute(db);
  await sql`create index locations_organization_idx on locations (organization_id)`.execute(db);
  await enableTenantIsolation(db, 'locations');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('locations').ifExists().execute();
  await db.schema.dropTable('organizations').ifExists().execute();
  await db.schema.dropTable('tenants').ifExists().execute();
}
