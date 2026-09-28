import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Tier 2 platform gap: referral management (track a referral to a specialist, its status, and
 * close the loop) — confirmed to not exist anywhere in this codebase before this. Both
 * `referred_to_practitioner_id` (an internal specialist) and `external_provider_name` (a provider
 * outside this practice, free text — no external-provider directory exists) are nullable and
 * independent: a referral can start with neither set ("refer to cardiology, TBD who") and be filled
 * in later via the same status-update path real coordination actually follows.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('referrals'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('referring_practitioner_id', 'uuid', (col) => col.notNull())
    .addColumn('referred_to_practitioner_id', 'uuid')
    .addColumn('external_provider_name', 'text')
    .addColumn('specialty', 'text', (col) => col.notNull())
    .addColumn('reason', 'text', (col) => col.notNull())
    .addColumn('urgency', 'text', (col) => col.notNull().defaultTo('routine'))
    .addColumn('notes', 'text')
    .addForeignKeyConstraint('referrals_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('referrals_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('referrals_referring_practitioner_fk', ['referring_practitioner_id'], 'practitioners', ['id'])
    .addForeignKeyConstraint('referrals_referred_to_practitioner_fk', ['referred_to_practitioner_id'], 'practitioners', ['id'])
    .addCheckConstraint('referrals_urgency_check', sql`urgency in ('routine', 'urgent', 'stat')`)
    .addCheckConstraint(
      'referrals_status_check',
      sql`status in ('pending', 'sent', 'scheduled', 'completed', 'declined', 'cancelled')`,
    )
    .execute();
  await sql`create index referrals_tenant_idx on referrals (tenant_id)`.execute(db);
  await sql`create index referrals_patient_idx on referrals (patient_id)`.execute(db);
  await enableTenantIsolation(db, 'referrals');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('referrals').ifExists().execute();
}
