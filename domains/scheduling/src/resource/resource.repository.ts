import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface ResourceRow {
  id: string;
  tenantId: string;
  locationId: string;
  name: string;
  resourceType: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class ResourceRepository {
  async create(
    trx: Executor,
    input: { tenantId: string; locationId: string; name: string; resourceType: string; createdBy: string },
  ): Promise<ResourceRow> {
    const row = await trx
      .insertInto('resources')
      .values({
        tenant_id: input.tenantId,
        location_id: input.locationId,
        name: input.name,
        resource_type: input.resourceType,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<ResourceRow | null> {
    const row = await trx
      .selectFrom('resources')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async findByIds(trx: Executor, tenantId: string, ids: string[]): Promise<ResourceRow[]> {
    if (ids.length === 0) return [];
    const rows = await trx.selectFrom('resources').selectAll().where('tenant_id', '=', tenantId).where('id', 'in', ids).execute();
    return rows.map(toRow);
  }

  async list(trx: Executor, tenantId: string, filter: { locationId?: string } = {}): Promise<ResourceRow[]> {
    let query = trx.selectFrom('resources').selectAll().where('tenant_id', '=', tenantId);
    if (filter.locationId) {
      query = query.where('location_id', '=', filter.locationId);
    }
    const rows = await query.orderBy('name', 'asc').execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['resources']>): ResourceRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    locationId: dbRow.location_id,
    name: dbRow.name,
    resourceType: dbRow.resource_type,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
