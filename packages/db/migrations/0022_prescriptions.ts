import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Prescription per EHR_BUILD_SPEC.md §14 ("eRx integration" / Phase 5), layered on top of Phase
 * 3's `medications` table the same way Phase 4's `diagnostic_reports` layered on top of
 * `observations`: `medications` is still the clinical fact ("patient is on X"), `prescriptions` is
 * the new order/transmission-event layer (pharmacy, quantity, refills, gateway correlation).
 * `medication_id` is required — creating a prescription always creates (or targets) a medication
 * list entry in the same transaction. `encounter_id` stays nullable (unlike Phase 4's orders) —
 * a refill/renewal can legitimately happen outside an open encounter.
 *
 * `is_controlled_substance`/`dea_schedule` exist so the *data model and permission gate* are real;
 * actual DEA-compliant EPCS (identity-proofing, 2FA, certified transmission) is out of scope per
 * the spec's own "EPCS only after compliance/vendor prerequisites are satisfied" — see README.md's
 * Phase 5 scope decisions.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('prescriptions'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('medication_id', 'uuid', (col) => col.notNull())
    .addColumn('encounter_id', 'uuid')
    .addColumn('prescriber_id', 'uuid', (col) => col.notNull())
    .addColumn('pharmacy_ncpdp_id', 'text', (col) => col.notNull())
    .addColumn('pharmacy_name', 'text', (col) => col.notNull())
    .addColumn('quantity', 'text', (col) => col.notNull())
    .addColumn('days_supply', 'integer')
    .addColumn('refills_authorized', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('refills_remaining', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('directions', 'text', (col) => col.notNull())
    .addColumn('is_controlled_substance', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('dea_schedule', 'text')
    .addColumn('gateway_reference_id', 'text')
    .addColumn('sent_at', 'timestamptz')
    .addForeignKeyConstraint('prescriptions_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('prescriptions_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('prescriptions_medication_fk', ['medication_id'], 'medications', ['id'])
    .addForeignKeyConstraint('prescriptions_encounter_fk', ['encounter_id'], 'encounters', ['id'])
    .addForeignKeyConstraint('prescriptions_prescriber_fk', ['prescriber_id'], 'practitioners', ['id'])
    .addCheckConstraint('prescriptions_dea_schedule_check', sql`dea_schedule is null or dea_schedule in ('II', 'III', 'IV', 'V')`)
    .execute();
  await sql`create index prescriptions_tenant_idx on prescriptions (tenant_id)`.execute(db);
  await sql`create index prescriptions_patient_idx on prescriptions (patient_id)`.execute(db);
  await sql`create index prescriptions_medication_idx on prescriptions (medication_id)`.execute(db);
  await enableTenantIsolation(db, 'prescriptions');

  await withCommonColumns(db.schema.createTable('prescription_refill_requests'))
    .addColumn('prescription_id', 'uuid', (col) => col.notNull())
    .addColumn('requested_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('responded_at', 'timestamptz')
    .addColumn('responded_by', 'uuid')
    .addColumn('denial_reason', 'text')
    .addForeignKeyConstraint('prescription_refill_requests_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('prescription_refill_requests_prescription_fk', ['prescription_id'], 'prescriptions', ['id'])
    .execute();
  await sql`create index prescription_refill_requests_tenant_idx on prescription_refill_requests (tenant_id)`.execute(db);
  await sql`create index prescription_refill_requests_prescription_idx on prescription_refill_requests (prescription_id)`.execute(
    db,
  );
  await enableTenantIsolation(db, 'prescription_refill_requests');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('prescription_refill_requests').ifExists().execute();
  await db.schema.dropTable('prescriptions').ifExists().execute();
}
