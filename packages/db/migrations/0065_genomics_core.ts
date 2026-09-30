import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Epic-parity item 5 — discrete coded genomic test results (e.g. a pharmacogenomic panel's
 * per-gene phenotype, or a hereditary-cancer gene-panel finding), explicitly NOT a sequencing
 * pipeline or raw VCF/FASTQ handling (no genomics lab partner exists). Modeled directly on
 * `diagnostic_reports`' own precedent (migration 0019) — a report row scoped to an encounter, with
 * `order_id` nullable and `encounter_id` required for the same reason that migration gives:
 * a report always needs a clinical context to be reviewed against.
 *
 * Individual findings get their OWN table (`genomic_findings`) rather than reusing `observations`
 * the way `diagnostic_reports` reuses it for lab values — a genomic finding's natural fields (gene
 * symbol, HGVS variant notation, ClinVar-style clinical significance, a CPIC-style phenotype
 * category) don't fit `observations`' generic code/display/value shape, and forcing them in would
 * lose exactly the discrete structure this item exists to provide. `phenotype_category` and
 * `hgvs_notation`/`variant_display` stay plain nullable text (no enum) — CPIC phenotype categories
 * differ per gene and there's no existing HGVS/ClinVar/PharmGKB code-system precedent in this repo
 * to constrain against, matching `diagnostic_reports.code_system`/`code`'s own loose-free-text
 * precedent.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('genomic_reports'))
    .addColumn('order_id', 'uuid')
    .addColumn('patient_id', 'uuid', (col) => col.notNull())
    .addColumn('encounter_id', 'uuid', (col) => col.notNull())
    .addColumn('code_system', 'text')
    .addColumn('code', 'text')
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addColumn('conclusion', 'text')
    .addColumn('performing_lab', 'text')
    .addColumn('issued_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('review_status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('reviewed_at', 'timestamptz')
    .addColumn('reviewed_by', 'uuid')
    .addColumn('amends_report_id', 'uuid')
    .addForeignKeyConstraint('genomic_reports_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('genomic_reports_order_fk', ['order_id'], 'orders', ['id'])
    .addForeignKeyConstraint('genomic_reports_patient_fk', ['patient_id'], 'patients', ['id'])
    .addForeignKeyConstraint('genomic_reports_encounter_fk', ['encounter_id'], 'encounters', ['id'])
    .addForeignKeyConstraint('genomic_reports_amends_fk', ['amends_report_id'], 'genomic_reports', ['id'])
    .addCheckConstraint('genomic_reports_review_status_check', sql`review_status in ('pending', 'reviewed', 'acknowledged')`)
    .execute();
  await sql`create index genomic_reports_tenant_idx on genomic_reports (tenant_id)`.execute(db);
  await sql`create index genomic_reports_patient_idx on genomic_reports (patient_id)`.execute(db);
  await sql`
    create index genomic_reports_pending_review_idx on genomic_reports (tenant_id, issued_at)
      where review_status = 'pending'
  `.execute(db);
  await enableTenantIsolation(db, 'genomic_reports');

  await withCommonColumns(db.schema.createTable('genomic_findings'))
    .addColumn('genomic_report_id', 'uuid', (col) => col.notNull())
    .addColumn('gene_symbol', 'text', (col) => col.notNull())
    .addColumn('hgvs_notation', 'text')
    .addColumn('variant_display', 'text')
    .addColumn('clinical_significance', 'text')
    .addColumn('phenotype_category', 'text')
    .addColumn('interpretation', 'text')
    .addForeignKeyConstraint('genomic_findings_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .addForeignKeyConstraint('genomic_findings_report_fk', ['genomic_report_id'], 'genomic_reports', ['id'])
    .addCheckConstraint(
      'genomic_findings_clinical_significance_check',
      sql`clinical_significance is null or clinical_significance in ('pathogenic', 'likely_pathogenic', 'uncertain_significance', 'likely_benign', 'benign')`,
    )
    .execute();
  await sql`create index genomic_findings_tenant_idx on genomic_findings (tenant_id)`.execute(db);
  await sql`create index genomic_findings_report_idx on genomic_findings (genomic_report_id)`.execute(db);
  await enableTenantIsolation(db, 'genomic_findings');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('genomic_findings').ifExists().execute();
  await db.schema.dropTable('genomic_reports').ifExists().execute();
}
