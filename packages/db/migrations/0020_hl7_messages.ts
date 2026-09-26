import { Kysely, sql } from 'kysely';
import { withCommonColumns, enableTenantIsolation } from './_common-columns.js';

/**
 * Raw immutable HL7 v2 message store per EHR_BUILD_SPEC.md §12.1's ingestion pipeline:
 * "Listener -> raw immutable message store -> parse -> validate -> route -> transform ->
 * canonical staging -> reconciliation/idempotency -> commit -> ACK/NACK -> event." `raw_message`
 * is never modified after insert, even when parsing fails — `parse_error` records the failure
 * without ever losing the original bytes. `message_control_id` (HL7's own MSH-10) is unique per
 * tenant so a redelivered message is a no-op, not a duplicate result.
 *
 * Phase 4 only implements the ORU^R01 (result) message type — see `packages/hl7`'s doc comment
 * for why ADT/SIU/ORM/MDM are out of scope for now.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await withCommonColumns(db.schema.createTable('hl7_messages'))
    .addColumn('message_control_id', 'text', (col) => col.notNull())
    .addColumn('message_type', 'text', (col) => col.notNull())
    .addColumn('raw_message', 'text', (col) => col.notNull())
    .addColumn('direction', 'text', (col) => col.notNull().defaultTo('inbound'))
    .addColumn('parse_error', 'text')
    .addColumn('processed_at', 'timestamptz')
    .addForeignKeyConstraint('hl7_messages_tenant_fk', ['tenant_id'], 'tenants', ['id'])
    .execute();
  await sql`create index hl7_messages_tenant_idx on hl7_messages (tenant_id)`.execute(db);
  await sql`
    create unique index hl7_messages_tenant_control_id_unique
      on hl7_messages (tenant_id, message_control_id)
  `.execute(db);
  await enableTenantIsolation(db, 'hl7_messages');
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('hl7_messages').ifExists().execute();
}
