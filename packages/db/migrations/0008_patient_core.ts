import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Patient + PatientIdentifier per EHR_BUILD_SPEC.md §5.2/§5.3. Demographics are flattened onto
 * `patients` (no separate Address/Telecom tables yet — nothing outside this domain needs to
 * reference one independently in Phase 2). `patient_identifiers` is its own table on purpose:
 * spec §5.3 explicitly forbids using an MRN (or any external identifier) as the patient's global
 * primary key — `patients.id` is the only stable internal key, and every external identifier
 * (MRN, SSN, payer member id, ...) is scoped to the issuing organization here instead.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('patients'))
    .addColumn('given_name', 'text', (col) => col.notNull())
    .addColumn('family_name', 'text', (col) => col.notNull())
    .addColumn('middle_name', 'text')
    .addColumn('date_of_birth', 'date', (col) => col.notNull())
    .addColumn('sex_at_birth', 'text')
    .addColumn('gender_identity', 'text')
    .addColumn('phone', 'text')
    .addColumn('email', sql`citext`)
    .addColumn('address_line1', 'text')
    .addColumn('address_line2', 'text')
    .addColumn('city', 'text')
    .addColumn('state', 'text')
    .addColumn('postal_code', 'text')
    .addColumn('country', 'text')
    .addColumn('preferred_language', 'text')
    .addForeignKeyConstraint('patients_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .execute();
  await sql`create index patients_tenant_idx on patients (tenant_id)`.execute(db);
  await sql`create index patients_tenant_dob_idx on patients (tenant_id, date_of_birth)`.execute(db);
  await sql`
    create index patients_tenant_name_idx on patients
      (tenant_id, lower(family_name), lower(given_name))
  `.execute(db);
  await enableTenantIsolation(db, 'patients');

  await withCommonColumns(db.schema.createTable('patient_identifiers'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('organization_id', 'uuid')
    .addColumn('identifier_system', 'text', (col) => col.notNull())
    .addColumn('value', 'text', (col) => col.notNull())
    .addColumn('is_primary', 'boolean', (col) => col.notNull().defaultTo(false))
    .addForeignKeyConstraint('patient_identifiers_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('patient_identifiers_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('patient_identifiers_organization_fk', ['organization_id'], 'organizations', ['id'])
    .execute();
  await sql`create index patient_identifiers_tenant_idx on patient_identifiers (tenant_id)`.execute(db);
  await sql`create index patient_identifiers_patient_idx on patient_identifiers (patient_id)`.execute(db);
  // Uniqueness is scoped to the issuing organization (spec §5.3) and only enforced while active,
  // so a retired/merged identifier never blocks reissuing the same value under the same issuer.
  await sql`
    create unique index patient_identifiers_issuer_value_active_unique
      on patient_identifiers (tenant_id, organization_id, identifier_system, value)
      where status = 'active'
  `.execute(db);
  await enableTenantIsolation(db, 'patient_identifiers');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('patient_identifiers').ifExists().execute();
  await db.schema.dropTable('patients').ifExists().execute();
}
