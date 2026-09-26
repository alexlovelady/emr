import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * EHR_BUILD_SPEC.md §17: "Proxy relationships must be explicit, effective-dated, and scoped."
 * `relationship_type: 'self'` (auto-created at portal registration) and every proxy relationship
 * both live in this one table — no special-casing "self" vs. "proxy" anywhere in the
 * authorization code (`ConsentService.assertAccess()` just checks for any active, in-window grant).
 * `scope` is a real column but not yet enforced per-category (see README's Phase 8 scope
 * decisions) — any active grant currently grants full access. Minor/state-law transition rules are
 * explicitly NOT computed here (spec's own words: "not a simple parent=true flag") — `effective_end`
 * exists so a grant *can* be time-bounded by staff, but no automatic age/service-type logic runs.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('patient_proxy_grants'))
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('portal_account_id', 'uuid', (col) => col.notNull())
    .addColumn('relationship_type', 'text', (col) => col.notNull())
    .addColumn('scope', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('effective_start', 'date', (col) => col.notNull().defaultTo(sql`current_date`))
    .addColumn('effective_end', 'date')
    .addColumn('granted_by', 'uuid')
    .addColumn('authority_document_id', 'uuid')
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('revocation_reason', 'text')
    .addForeignKeyConstraint('patient_proxy_grants_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('patient_proxy_grants_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('patient_proxy_grants_account_fk', ['portal_account_id'], 'portal_accounts', ['id'])
    .addForeignKeyConstraint('patient_proxy_grants_document_fk', ['authority_document_id'], 'documents', ['id'])
    .addCheckConstraint(
      'patient_proxy_grants_relationship_type_check',
      sql`relationship_type in ('self', 'parent', 'guardian', 'caregiver', 'other')`,
    )
    .execute();
  await sql`create index patient_proxy_grants_tenant_idx on patient_proxy_grants (tenant_id)`.execute(db);
  await sql`create index patient_proxy_grants_patient_idx on patient_proxy_grants (patient_id)`.execute(db);
  await sql`create index patient_proxy_grants_account_idx on patient_proxy_grants (portal_account_id)`.execute(db);
  await enableTenantIsolation(db, 'patient_proxy_grants');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('patient_proxy_grants').ifExists().execute();
}
