import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface OrderRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  orderingPractitionerId: string;
  orderType: string;
  codeSystem: string | null;
  code: string | null;
  displayName: string;
  priority: string;
  orderedAt: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class OrderRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      encounterId: string;
      orderingPractitionerId: string;
      orderType: string;
      codeSystem: string | null;
      code: string | null;
      displayName: string;
      priority: string;
      createdBy: string;
    },
  ): Promise<OrderRow> {
    const row = await trx
      .insertInto('orders')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        encounter_id: input.encounterId,
        ordering_practitioner_id: input.orderingPractitionerId,
        order_type: input.orderType,
        code_system: input.codeSystem,
        code: input.code,
        display_name: input.displayName,
        priority: input.priority,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<OrderRow | null> {
    const row = await trx
      .selectFrom('orders')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async list(trx: Executor, tenantId: string, filter: { patientId?: string } = {}): Promise<OrderRow[]> {
    let query = trx.selectFrom('orders').selectAll().where('tenant_id', '=', tenantId);
    if (filter.patientId) query = query.where('patient_id', '=', filter.patientId);
    const rows = await query.orderBy('ordered_at', 'desc').execute();
    return rows.map(toRow);
  }

  async setStatus(trx: Executor, tenantId: string, id: string, status: string, updatedBy: string): Promise<OrderRow> {
    const row = await trx
      .updateTable('orders')
      .set({ status, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['orders']>): OrderRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    encounterId: dbRow.encounter_id,
    orderingPractitionerId: dbRow.ordering_practitioner_id,
    orderType: dbRow.order_type,
    codeSystem: dbRow.code_system,
    code: dbRow.code,
    displayName: dbRow.display_name,
    priority: dbRow.priority,
    orderedAt: dbRow.ordered_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
