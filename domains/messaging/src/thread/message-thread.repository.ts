import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface MessageThreadRow {
  id: string;
  tenantId: string;
  patientId: string;
  subject: string;
  createdByType: string;
  lastMessageAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface MessageRow {
  id: string;
  tenantId: string;
  threadId: string;
  senderType: string;
  senderId: string;
  body: string;
  readAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class MessageThreadRepository {
  async createThread(
    trx: Executor,
    input: { tenantId: string; patientId: string; subject: string; createdByType: string; createdBy: string },
  ): Promise<MessageThreadRow> {
    const row = await trx
      .insertInto('message_threads')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        subject: input.subject,
        created_by_type: input.createdByType,
        status: 'open',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toThreadRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<MessageThreadRow | null> {
    const row = await trx
      .selectFrom('message_threads')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toThreadRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<MessageThreadRow[]> {
    const rows = await trx
      .selectFrom('message_threads')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('last_message_at', 'desc')
      .execute();
    return rows.map(toThreadRow);
  }

  async touchLastMessageAt(trx: Executor, tenantId: string, id: string, at: Date, updatedBy: string): Promise<void> {
    await trx
      .updateTable('message_threads')
      .set({ last_message_at: at, updated_at: at, updated_by: updatedBy })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .execute();
  }

  async addMessage(
    trx: Executor,
    input: { tenantId: string; threadId: string; senderType: string; senderId: string; body: string },
  ): Promise<MessageRow> {
    const row = await trx
      .insertInto('messages')
      .values({
        tenant_id: input.tenantId,
        thread_id: input.threadId,
        sender_type: input.senderType,
        sender_id: input.senderId,
        body: input.body,
        status: 'sent',
        created_by: input.senderId,
        updated_by: input.senderId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toMessageRow(row);
  }

  async listMessages(trx: Executor, tenantId: string, threadId: string): Promise<MessageRow[]> {
    const rows = await trx
      .selectFrom('messages')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('thread_id', '=', threadId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toMessageRow);
  }

  /** Marks every message NOT authored by `readerSenderType` as read — i.e. "I just read the other side's messages." */
  async markRead(trx: Executor, tenantId: string, threadId: string, readerSenderType: string, readAt: Date): Promise<void> {
    await trx
      .updateTable('messages')
      .set({ read_at: readAt, updated_at: readAt })
      .where('tenant_id', '=', tenantId)
      .where('thread_id', '=', threadId)
      .where('sender_type', '!=', readerSenderType)
      .where('read_at', 'is', null)
      .execute();
  }
}

function toThreadRow(dbRow: Selectable<DB['message_threads']>): MessageThreadRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    subject: dbRow.subject,
    createdByType: dbRow.created_by_type,
    lastMessageAt: dbRow.last_message_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}

function toMessageRow(dbRow: Selectable<DB['messages']>): MessageRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    threadId: dbRow.thread_id,
    senderType: dbRow.sender_type,
    senderId: dbRow.sender_id,
    body: dbRow.body,
    readAt: dbRow.read_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}

/**
 * Minimal cross-domain lookup, same reasoning as `@ehr/consent`'s `portalAccountExists` — the
 * notification trigger needs each proxy's contact email, but `@ehr/portal` (which fully owns
 * `portal_accounts`) depends on `@ehr/messaging`'s neighbor `@ehr/consent`, not the other way
 * around, so this domain can't import a repository from there.
 */
export async function getPortalAccountEmails(trx: Executor, tenantId: string, portalAccountIds: string[]): Promise<Map<string, string>> {
  if (portalAccountIds.length === 0) return new Map();
  const rows = await trx
    .selectFrom('portal_accounts')
    .select(['id', 'email'])
    .where('tenant_id', '=', tenantId)
    .where('id', 'in', portalAccountIds)
    .execute();
  return new Map(rows.map((row) => [row.id, row.email]));
}
