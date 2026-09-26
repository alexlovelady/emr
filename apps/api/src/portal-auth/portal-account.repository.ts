import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface PortalAccountRow {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  mfaEnrolled: boolean;
  lastLoginAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class PortalAccountRepository {
  async create(trx: Executor, input: { tenantId: string; email: string; passwordHash: string }): Promise<PortalAccountRow> {
    const row = await trx
      .insertInto('portal_accounts')
      .values({
        tenant_id: input.tenantId,
        email: input.email,
        password_hash: input.passwordHash,
        status: 'active',
        created_by: null,
        updated_by: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<PortalAccountRow | null> {
    const row = await trx
      .selectFrom('portal_accounts')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async findByEmail(trx: Executor, tenantId: string, email: string): Promise<PortalAccountRow | null> {
    const row = await trx
      .selectFrom('portal_accounts')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('email', '=', email)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async updateLastLogin(trx: Executor, tenantId: string, id: string, at: Date): Promise<void> {
    await trx
      .updateTable('portal_accounts')
      .set({ last_login_at: at, updated_at: at })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .execute();
  }
}

function toRow(dbRow: Selectable<DB['portal_accounts']>): PortalAccountRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    email: dbRow.email,
    passwordHash: dbRow.password_hash,
    mfaEnrolled: dbRow.mfa_enrolled,
    lastLoginAt: dbRow.last_login_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
