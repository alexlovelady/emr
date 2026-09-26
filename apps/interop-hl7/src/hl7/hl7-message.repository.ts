import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface Hl7MessageRow {
  id: string;
  tenantId: string;
  messageControlId: string;
  messageType: string;
  rawMessage: string;
  direction: string;
  parseError: string | null;
  processedAt: Date | null;
  status: string;
  createdAt: Date;
}

type Executor = Kysely<DB> | Transaction<DB>;

/** Owned by apps/interop-hl7 alone — no other app touches `hl7_messages`, so this isn't a shared domain package. */
export class Hl7MessageRepository {
  async findByControlId(trx: Executor, tenantId: string, messageControlId: string): Promise<Hl7MessageRow | null> {
    const row = await trx
      .selectFrom('hl7_messages')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('message_control_id', '=', messageControlId)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async create(
    trx: Executor,
    input: { tenantId: string; messageControlId: string; messageType: string; rawMessage: string; createdBy: string },
  ): Promise<Hl7MessageRow> {
    const row = await trx
      .insertInto('hl7_messages')
      .values({
        tenant_id: input.tenantId,
        message_control_id: input.messageControlId,
        message_type: input.messageType,
        raw_message: input.rawMessage,
        direction: 'inbound',
        status: 'received',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async markProcessed(trx: Executor, tenantId: string, id: string, updatedBy: string): Promise<Hl7MessageRow> {
    const row = await trx
      .updateTable('hl7_messages')
      .set({ status: 'processed', processed_at: new Date(), updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async markFailed(trx: Executor, tenantId: string, id: string, parseError: string, updatedBy: string): Promise<Hl7MessageRow> {
    const row = await trx
      .updateTable('hl7_messages')
      .set({ status: 'failed', parse_error: parseError, processed_at: new Date(), updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['hl7_messages']>): Hl7MessageRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    messageControlId: dbRow.message_control_id,
    messageType: dbRow.message_type,
    rawMessage: dbRow.raw_message,
    direction: dbRow.direction,
    parseError: dbRow.parse_error,
    processedAt: dbRow.processed_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
  };
}
