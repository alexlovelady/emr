import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * External record reconciliation per EHR_BUILD_SPEC.md §11.3: incoming C-CDA/FHIR/HL7 clinical
 * items become `external_candidate` records for medications/problems/allergies, reviewed via an
 * explicit accept/reject/mark-duplicate/replace workflow rather than auto-merged into the chart.
 * `payload` holds the pre-structured candidate fields (see packages/db's Phase 4 migration plan
 * doc for why real C-CDA XML parsing is deferred — this table's shape is standard-agnostic on
 * purpose, so a real XML front end can populate it later without a schema change).
 *
 * `smart_clients` backs Phase 4's SMART auth (client-credentials grant only — see
 * apps/interop-fhir) — seeded test clients per tenant, never real production credentials.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('external_candidates'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('origin_type', 'text', (col) => col.notNull())
    .addColumn('source_document_id', 'text', (col) => col.notNull())
    .addColumn('resource_type', 'text', (col) => col.notNull())
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('replaces_resource_id', 'uuid')
    .addColumn('created_resource_id', 'uuid')
    .addColumn('reviewed_at', 'timestamptz')
    .addColumn('reviewed_by', 'uuid')
    .addForeignKeyConstraint('external_candidates_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('external_candidates_patient_fk', ['patient_id'], 'patients', ['id'])
    .addCheckConstraint('external_candidates_origin_type_check', sql`origin_type in ('c-cda', 'fhir', 'hl7')`)
    .addCheckConstraint(
      'external_candidates_resource_type_check',
      sql`resource_type in ('medication', 'problem', 'allergy')`,
    )
    .execute();
  await sql`create index external_candidates_tenant_idx on external_candidates (tenant_id)`.execute(db);
  await sql`create index external_candidates_patient_idx on external_candidates (patient_id)`.execute(db);
  await enableTenantIsolation(db, 'external_candidates');

  await withCommonColumns(db.schema.createTable('smart_clients'))
    .addColumn('client_id', 'text', (col) => col.notNull())
    .addColumn('client_secret_hash', 'text', (col) => col.notNull())
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addColumn('allowed_scopes', sql`text[]`, (col) => col.notNull())
    .addForeignKeyConstraint('smart_clients_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .execute();
  await sql`create index smart_clients_tenant_idx on smart_clients (tenant_id)`.execute(db);
  await sql`create unique index smart_clients_client_id_unique on smart_clients (client_id)`.execute(db);
  await enableTenantIsolation(db, 'smart_clients');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('smart_clients').ifExists().execute();
  await db.schema.dropTable('external_candidates').ifExists().execute();
}
