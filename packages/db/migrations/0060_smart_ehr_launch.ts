import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Item 24: EHR launch, the other half of SMART App Launch that migration 0049 deliberately left
 * for later ("needs to be embedded inside a host EHR's own UI with a launch-context token — a
 * different, larger feature"). A clinician viewing a patient's chart (already-authenticated,
 * already-authorized staff, not a patient-portal consent flow) triggers a launch via
 * `apps/api`'s new `POST /api/v1/patients/:id/smart-launch`, which inserts a row here keyed by an
 * opaque `launch` id; the EHR then redirects the browser to the app's registered `launch_uri` with
 * that id. The app's own `/authorize` request (carrying `launch=<id>`) resolves it directly into an
 * authorization code — see `AuthorizeController`'s new branch — skipping the patient-portal
 * consent/picker UI entirely, since the context (which patient, optionally which encounter) is
 * already fixed by the EHR and the acting clinician already had legitimate access to it.
 *
 * `smart_authorization_codes.portal_account_id` loses its NOT NULL: an EHR-launch code has no
 * portal account at all (`launched_by_user_id` instead identifies the launching clinician).
 * `encounter_id` is optional launch context on both tables (SMART's `encounter` launch parameter).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('smart_authorization_codes').alterColumn('portal_account_id', (col) => col.dropNotNull()).execute();
  await db.schema
    .alterTable('smart_authorization_codes')
    .addColumn('encounter_id', 'uuid')
    .addColumn('launched_by_user_id', 'uuid')
    .execute();
  await db.schema
    .alterTable('smart_authorization_codes')
    .addForeignKeyConstraint('smart_authorization_codes_encounter_fk', ['encounter_id'], 'encounters', ['id'])
    .execute();
  await db.schema
    .alterTable('smart_authorization_codes')
    .addForeignKeyConstraint('smart_authorization_codes_launched_by_fk', ['launched_by_user_id'], 'users', ['id'])
    .execute();

  await withCommonColumns(db.schema.createTable('smart_launch_contexts'))
    .addColumn('client_id', 'text', (col) => col.notNull())
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('encounter_id', 'uuid')
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('consumed_at', 'timestamptz')
    .addForeignKeyConstraint('smart_launch_contexts_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('smart_launch_contexts_client_fk', ['client_id'], 'smart_clients', ['client_id'])
    .addForeignKeyConstraint('smart_launch_contexts_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('smart_launch_contexts_encounter_fk', ['encounter_id'], 'encounters', ['id'])
    .addForeignKeyConstraint('smart_launch_contexts_user_fk', ['user_id'], 'users', ['id'])
    .execute();
  await sql`create index smart_launch_contexts_tenant_idx on smart_launch_contexts (tenant_id)`.execute(db);
  await enableTenantIsolation(db, 'smart_launch_contexts');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('smart_launch_contexts').ifExists().execute();
  await db.schema.alterTable('smart_authorization_codes').dropConstraint('smart_authorization_codes_encounter_fk').execute();
  await db.schema.alterTable('smart_authorization_codes').dropConstraint('smart_authorization_codes_launched_by_fk').execute();
  await db.schema.alterTable('smart_authorization_codes').dropColumn('encounter_id').dropColumn('launched_by_user_id').execute();
  await db.schema.alterTable('smart_authorization_codes').alterColumn('portal_account_id', (col) => col.setNotNull()).execute();
}
