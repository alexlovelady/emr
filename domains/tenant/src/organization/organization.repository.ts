import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface OrganizationRow {
  id: string;
  tenantId: string;
  name: string;
  npi: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class OrganizationRepository {
  async create(
    trx: Executor,
    input: { tenantId: string; name: string; npi: string | null; createdBy: string },
  ): Promise<OrganizationRow> {
    const row = await trx
      .insertInto('organizations')
      .values({
        tenant_id: input.tenantId,
        name: input.name,
        npi: input.npi,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<OrganizationRow | null> {
    const row = await trx
      .selectFrom('organizations')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async list(trx: Executor, tenantId: string): Promise<OrganizationRow[]> {
    const rows = await trx
      .selectFrom('organizations')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['organizations']>): OrganizationRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    name: dbRow.name,
    npi: dbRow.npi,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
