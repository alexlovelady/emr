import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Appointment per EHR_BUILD_SPEC.md §11.1's golden-path state machine, scoped to what exists
 * before an Encounter does (Phase 3+): Scheduled → Confirmed → CheckedIn, plus the pragmatic
 * Cancelled/NoShow exits real-world scheduling needs (the spec's diagram doesn't show them since
 * it's tracing the happy path, but rule #15 — "prefer explicit state machines" — means they need
 * to be real states here, not an afterthought). `status` (common columns) carries the current
 * state; the *_at columns are a timestamped history of each transition.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('appointments'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('location_id', 'uuid', (col) => col.notNull())
    .addColumn('practitioner_id', 'uuid', (col) => col.notNull())
    .addColumn('appointment_type', 'text', (col) => col.notNull())
    .addColumn('scheduled_start', 'timestamptz', (col) => col.notNull())
    .addColumn('scheduled_end', 'timestamptz', (col) => col.notNull())
    .addColumn('confirmed_at', 'timestamptz')
    .addColumn('checked_in_at', 'timestamptz')
    .addColumn('cancelled_at', 'timestamptz')
    .addColumn('cancellation_reason', 'text')
    .addColumn('no_show_at', 'timestamptz')
    .addForeignKeyConstraint('appointments_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('appointments_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('appointments_location_fk', ['location_id'], 'locations', ['id'])
    .addForeignKeyConstraint('appointments_practitioner_fk', ['practitioner_id'], 'practitioners', ['id'])
    .execute();
  await sql`create index appointments_tenant_idx on appointments (tenant_id)`.execute(db);
  await sql`create index appointments_patient_idx on appointments (patient_id)`.execute(db);
  await sql`create index appointments_practitioner_start_idx on appointments (practitioner_id, scheduled_start)`.execute(
    db,
  );
  await enableTenantIsolation(db, 'appointments');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('appointments').ifExists().execute();
}
