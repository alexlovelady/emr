import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Tier 2 platform gap: prior authorization tracking (the insurance kind — request/approve/deny
 * before a procedure, distinct from eRx's own narrow `priorAuthRequired` flag on refill requests,
 * which is unrelated). No live payer prior-auth API exists to integrate against — same buy-not-
 * built boundary as clearinghouse/eligibility elsewhere in this codebase; `payer_reference_number`
 * is filled in manually once staff has the payer's response, the same way `remittance_advice_number`
 * works for remittances.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('prior_authorizations'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('coverage_id', 'uuid', (col) => col.notNull())
    .addColumn('requested_by_practitioner_id', 'uuid', (col) => col.notNull())
    .addColumn('procedure_code', 'text', (col) => col.notNull())
    .addColumn('procedure_description', 'text', (col) => col.notNull())
    .addColumn('diagnosis_code', 'text', (col) => col.notNull())
    .addColumn('payer_reference_number', 'text')
    .addColumn('valid_from', 'date')
    .addColumn('valid_until', 'date')
    .addColumn('denial_reason', 'text')
    .addColumn('notes', 'text')
    .addForeignKeyConstraint('prior_authorizations_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('prior_authorizations_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('prior_authorizations_coverage_fk', ['coverage_id'], 'coverages', ['id'])
    .addForeignKeyConstraint('prior_authorizations_practitioner_fk', ['requested_by_practitioner_id'], 'practitioners', ['id'])
    .addCheckConstraint(
      'prior_authorizations_status_check',
      sql`status in ('pending', 'approved', 'denied', 'expired', 'cancelled')`,
    )
    .execute();
  await sql`create index prior_authorizations_tenant_idx on prior_authorizations (tenant_id)`.execute(db);
  await sql`create index prior_authorizations_patient_idx on prior_authorizations (patient_id)`.execute(db);
  await enableTenantIsolation(db, 'prior_authorizations');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('prior_authorizations').ifExists().execute();
}
