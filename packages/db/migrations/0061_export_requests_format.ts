import { Kysely, sql } from 'kysely';

/**
 * Item 25: records-export gains real C-CDA (CCD) XML and PDF output alongside the original JSON
 * dump — see `domains/portal/src/export/ccd-generator.ts`/`pdf-generator.ts`. `format` records
 * which one a given request produced; defaulting existing/future JSON-only callers to `'json'`
 * keeps this fully backward compatible.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('export_requests').addColumn('format', 'text', (col) => col.notNull().defaultTo('json')).execute();
  await db.schema
    .alterTable('export_requests')
    .addCheckConstraint('export_requests_format_check', sql`format in ('json', 'pdf', 'ccd-xml')`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('export_requests').dropConstraint('export_requests_format_check').execute();
  await db.schema.alterTable('export_requests').dropColumn('format').execute();
}
