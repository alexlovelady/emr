import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Claim + ClaimVersion per EHR_BUILD_SPEC.md §13.2: "Never mutate a submitted claim in place."
 * `claims` carries current state; `claim_versions` is the immutable history (ClaimVersion 1
 * draft, 2 submitted, 3+ corrected/resubmission — the spec's own literal example). `claims.status`
 * continues the Encounter state machine's own progression (which stops at `coding_review`, spec
 * §11.1) as a *separate* state machine: draft -> submitted -> accepted/rejected -> adjudicated ->
 * paid/denied. One Claim per Encounter, matching spec §5.2's aggregate diagram directly.
 *
 * `denials` covers both a 277CA rejection and an 835 with a denial code (migration 0025's
 * `remittances` references `claim_versions`, created after this file).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('claims'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('encounter_id', 'uuid', (col) => col.notNull())
    .addColumn('coverage_id', 'uuid')
    .addColumn('billing_practitioner_id', 'uuid', (col) => col.notNull())
    .addColumn('total_charge_amount', 'numeric', (col) => col.notNull())
    .addColumn('current_version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('clearinghouse_transaction_id', 'text')
    .addForeignKeyConstraint('claims_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('claims_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('claims_encounter_fk', ['encounter_id'], 'encounters', ['id'])
    .addForeignKeyConstraint('claims_coverage_fk', ['coverage_id'], 'coverages', ['id'])
    .addForeignKeyConstraint('claims_practitioner_fk', ['billing_practitioner_id'], 'practitioners', ['id'])
    .execute();
  await sql`create index claims_tenant_idx on claims (tenant_id)`.execute(db);
  await sql`create index claims_patient_idx on claims (patient_id)`.execute(db);
  await sql`create index claims_encounter_idx on claims (encounter_id)`.execute(db);
  await sql`create index claims_clearinghouse_transaction_idx on claims (clearinghouse_transaction_id)`.execute(db);
  await enableTenantIsolation(db, 'claims');

  await withCommonColumns(db.schema.createTable('claim_versions'))
    .addColumn('claim_id', 'uuid', (col) => col.notNull())
    .addColumn('version_number', 'integer', (col) => col.notNull())
    .addColumn('version_status', 'text', (col) => col.notNull())
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('clearinghouse_transaction_id', 'text')
    .addColumn('submitted_at', 'timestamptz')
    .addForeignKeyConstraint('claim_versions_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('claim_versions_claim_fk', ['claim_id'], 'claims', ['id'])
    .execute();
  await sql`create index claim_versions_tenant_idx on claim_versions (tenant_id)`.execute(db);
  await sql`create unique index claim_versions_claim_version_unique on claim_versions (tenant_id, claim_id, version_number)`.execute(
    db,
  );
  await sql`create index claim_versions_clearinghouse_transaction_idx on claim_versions (clearinghouse_transaction_id)`.execute(db);
  await enableTenantIsolation(db, 'claim_versions');

  await withCommonColumns(db.schema.createTable('denials'))
    .addColumn('claim_id', 'uuid', (col) => col.notNull())
    .addColumn('denial_reason_code', 'text', (col) => col.notNull())
    .addColumn('denial_reason_text', 'text', (col) => col.notNull())
    .addColumn('denied_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('resolved_at', 'timestamptz')
    .addColumn('resolution_notes', 'text')
    .addColumn('task_id', 'uuid')
    .addForeignKeyConstraint('denials_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('denials_claim_fk', ['claim_id'], 'claims', ['id'])
    .addForeignKeyConstraint('denials_task_fk', ['task_id'], 'tasks', ['id'])
    .execute();
  await sql`create index denials_tenant_idx on denials (tenant_id)`.execute(db);
  await sql`create index denials_claim_idx on denials (claim_id)`.execute(db);
  await enableTenantIsolation(db, 'denials');

  await db.schema
    .alterTable('charges')
    .addColumn('claim_id', 'uuid', (col) => col.references('claims.id'))
    .execute();
  await sql`create index charges_claim_idx on charges (claim_id)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('charges').dropColumn('claim_id').execute();
  await db.schema.dropTable('denials').ifExists().execute();
  await db.schema.dropTable('claim_versions').ifExists().execute();
  await db.schema.dropTable('claims').ifExists().execute();
}
