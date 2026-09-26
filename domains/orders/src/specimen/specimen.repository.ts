import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface SpecimenRow {
  id: string;
  tenantId: string;
  orderId: string;
  specimenType: string;
  accessionNumber: string | null;
  collectedAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class SpecimenRepository {
  async create(
    trx: Executor,
    input: { tenantId: string; orderId: string; specimenType: string; accessionNumber: string | null; createdBy: string },
  ): Promise<SpecimenRow> {
    const row = await trx
      .insertInto('specimens')
      .values({
        tenant_id: input.tenantId,
        order_id: input.orderId,
        specimen_type: input.specimenType,
        accession_number: input.accessionNumber,
        collected_at: new Date(),
        status: 'collected',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<SpecimenRow | null> {
    const row = await trx
      .selectFrom('specimens')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByOrder(trx: Executor, tenantId: string, orderId: string): Promise<SpecimenRow[]> {
    const rows = await trx
      .selectFrom('specimens')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('order_id', '=', orderId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['specimens']>): SpecimenRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    orderId: dbRow.order_id,
    specimenType: dbRow.specimen_type,
    accessionNumber: dbRow.accession_number,
    collectedAt: dbRow.collected_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
