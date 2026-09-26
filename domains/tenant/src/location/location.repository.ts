import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface LocationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
  timeZone: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class LocationRepository {
  async create(
    trx: Executor,
    input: { tenantId: string; organizationId: string; name: string; timeZone: string; createdBy: string },
  ): Promise<LocationRow> {
    const row = await trx
      .insertInto('locations')
      .values({
        tenant_id: input.tenantId,
        organization_id: input.organizationId,
        name: input.name,
        time_zone: input.timeZone,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<LocationRow | null> {
    const row = await trx
      .selectFrom('locations')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async list(trx: Executor, tenantId: string): Promise<LocationRow[]> {
    const rows = await trx
      .selectFrom('locations')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['locations']>): LocationRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    organizationId: dbRow.organization_id,
    name: dbRow.name,
    timeZone: dbRow.time_zone,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
