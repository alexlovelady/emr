import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface UserRow {
  id: string;
  tenantId: string;
  email: string;
  status: string;
  mfaEnrolled: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class UserRepository {
  async create(
    trx: Executor,
    input: { tenantId: string; email: string; passwordHash: string; createdBy: string },
  ): Promise<UserRow> {
    const row = await trx
      .insertInto('users')
      .values({
        tenant_id: input.tenantId,
        email: input.email,
        password_hash: input.passwordHash,
        password_algo: 'argon2id',
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<UserRow | null> {
    const row = await trx
      .selectFrom('users')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async list(trx: Executor, tenantId: string): Promise<UserRow[]> {
    const rows = await trx
      .selectFrom('users')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['users']>): UserRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    email: dbRow.email,
    status: dbRow.status,
    mfaEnrolled: dbRow.mfa_enrolled,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
