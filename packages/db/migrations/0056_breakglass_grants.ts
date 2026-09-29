import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Item 22 layer 8 (break-glass): a time-limited, explicitly-invoked, per-patient emergency access
 * grant. Spec §6.3's requirements, each mapped to a real column: an explicit user action
 * (`POST /api/v1/auth/breakglass`, not automatic), a reason code + free-text justification
 * (`reason_code`/`justification`), time-limited access (`expires_at`), an elevated audit event
 * (the invoking controller's own `@Audited` event, which captures this row's id/reason/
 * justification in its payload), and a compliance review queue (`reviewed_at`/`reviewed_by` —
 * `packages/alerting`'s `breakglass_review` rule keeps an alert open for any grant with
 * `reviewed_at is null`, closing the loop through the item-18 Alerts page rather than new UI).
 * Tenant-scoped and RLS-enabled like any other patient-linked data.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('breakglass_grants'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('reason_code', 'text', (col) => col.notNull())
    .addColumn('justification', 'text', (col) => col.notNull())
    .addColumn('granted_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('revoked_by', 'uuid')
    .addColumn('reviewed_at', 'timestamptz')
    .addColumn('reviewed_by', 'uuid')
    .addForeignKeyConstraint('breakglass_grants_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('breakglass_grants_user_fk', ['user_id'], 'users', ['id'])
    .addForeignKeyConstraint('breakglass_grants_patient_fk', ['patient_id'], 'patients', ['id'])
    .addCheckConstraint('breakglass_grants_reason_code_check', sql`reason_code in ('emergency_treatment', 'life_threatening', 'other')`)
    .execute();
  await sql`create index breakglass_grants_tenant_idx on breakglass_grants (tenant_id)`.execute(db);
  await sql`create index breakglass_grants_active_idx on breakglass_grants (tenant_id, user_id, patient_id) where revoked_at is null`.execute(db);
  await enableTenantIsolation(db, 'breakglass_grants');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('breakglass_grants').ifExists().execute();
}
