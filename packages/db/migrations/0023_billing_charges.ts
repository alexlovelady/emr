import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * ChargeItem per EHR_BUILD_SPEC.md §5.2's RCM chain (`Encounter -> ChargeItem -> Claim ->
 * ClaimVersion -> Remittance -> LedgerEntry`), scoped to what Phase 6 owns: charge capture + the
 * coding queue (`status`: draft -> coded -> billed -> void). `claim_id` is added later by
 * migration 0024 (the `claims` table doesn't exist yet at this point) — same forward-reference
 * pattern already used for `observations.order_id` in migration 0019.
 *
 * `diagnosis_codes` is a denormalized ICD-10 pointer array rather than a dedicated Diagnosis
 * aggregate — Phase 3 never built one and Phase 6's bullet list doesn't call for retrofitting it.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('charges'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('encounter_id', 'uuid', (col) => col.notNull())
    .addColumn('billing_practitioner_id', 'uuid', (col) => col.notNull())
    .addColumn('code_system', 'text', (col) => col.notNull())
    .addColumn('code', 'text', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('units', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('unit_price', 'numeric', (col) => col.notNull())
    .addColumn('diagnosis_codes', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addForeignKeyConstraint('charges_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('charges_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('charges_encounter_fk', ['encounter_id'], 'encounters', ['id'])
    .addForeignKeyConstraint('charges_practitioner_fk', ['billing_practitioner_id'], 'practitioners', ['id'])
    .execute();
  await sql`create index charges_tenant_idx on charges (tenant_id)`.execute(db);
  await sql`create index charges_patient_idx on charges (patient_id)`.execute(db);
  await sql`create index charges_encounter_idx on charges (encounter_id)`.execute(db);
  await sql`create index charges_coding_queue_idx on charges (tenant_id, created_at) where status = 'draft'`.execute(db);
  await enableTenantIsolation(db, 'charges');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('charges').ifExists().execute();
}
