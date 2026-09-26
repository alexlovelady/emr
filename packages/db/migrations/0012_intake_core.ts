import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Lightweight dynamic intake forms — no drag-and-drop form-builder UI exists yet (spec's patient
 * portal is Phase 8), so `intake_form_templates.schema` is a JSON field-definition array the API
 * validates responses against, rather than a fully modeled form-builder domain.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('intake_form_templates'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('schema_version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('schema', 'jsonb', (col) => col.notNull())
    .addForeignKeyConstraint('intake_form_templates_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .execute();
  await sql`create index intake_form_templates_tenant_idx on intake_form_templates (tenant_id)`.execute(db);
  await enableTenantIsolation(db, 'intake_form_templates');

  await withCommonColumns(db.schema.createTable('intake_form_responses'))
    .addColumn('template_id', 'uuid', (col) => col.notNull())
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('appointment_id', 'uuid')
    .addColumn('answers', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('submitted_at', 'timestamptz')
    .addForeignKeyConstraint('intake_form_responses_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('intake_form_responses_template_fk', ['template_id'], 'intake_form_templates', ['id'])
    .addForeignKeyConstraint('intake_form_responses_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('intake_form_responses_appointment_fk', ['appointment_id'], 'appointments', ['id'])
    .execute();
  await sql`create index intake_form_responses_tenant_idx on intake_form_responses (tenant_id)`.execute(db);
  await sql`create index intake_form_responses_patient_idx on intake_form_responses (patient_id)`.execute(db);
  await enableTenantIsolation(db, 'intake_form_responses');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('intake_form_responses').ifExists().execute();
  await db.schema.dropTable('intake_form_templates').ifExists().execute();
}
