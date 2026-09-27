import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface LocationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
  timeZone: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface LocationAddressInput {
  addressLine1?: string | null | undefined;
  addressLine2?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  postalCode?: string | null | undefined;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class LocationRepository {
  async create(
    trx: Executor,
    input: { tenantId: string; organizationId: string; name: string; timeZone: string; createdBy: string } & LocationAddressInput,
  ): Promise<LocationRow> {
    const row = await trx
      .insertInto('locations')
      .values({
        tenant_id: input.tenantId,
        organization_id: input.organizationId,
        name: input.name,
        time_zone: input.timeZone,
        address_line1: input.addressLine1 ?? null,
        address_line2: input.addressLine2 ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postal_code: input.postalCode ?? null,
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

  async update(
    trx: Executor,
    tenantId: string,
    id: string,
    input: { name?: string | undefined; timeZone?: string | undefined; updatedBy: string } & LocationAddressInput,
  ): Promise<LocationRow> {
    const row = await trx
      .updateTable('locations')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.timeZone !== undefined ? { time_zone: input.timeZone } : {}),
        ...(input.addressLine1 !== undefined ? { address_line1: input.addressLine1 } : {}),
        ...(input.addressLine2 !== undefined ? { address_line2: input.addressLine2 } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.postalCode !== undefined ? { postal_code: input.postalCode } : {}),
        updated_by: input.updatedBy,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async setStatus(trx: Executor, tenantId: string, id: string, status: string, updatedBy: string): Promise<LocationRow> {
    const row = await trx
      .updateTable('locations')
      .set({ status, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['locations']>): LocationRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    organizationId: dbRow.organization_id,
    name: dbRow.name,
    timeZone: dbRow.time_zone,
    addressLine1: dbRow.address_line1,
    addressLine2: dbRow.address_line2,
    city: dbRow.city,
    state: dbRow.state,
    postalCode: dbRow.postal_code,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
