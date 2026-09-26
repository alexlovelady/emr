import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface ObservationRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  category: string;
  code: string;
  displayName: string;
  valueQuantity: string | null;
  valueText: string | null;
  unit: string | null;
  effectiveAt: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class ObservationRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      encounterId: string;
      category: string;
      code: string;
      displayName: string;
      valueQuantity: string | null;
      valueText: string | null;
      unit: string | null;
      createdBy: string;
    },
  ): Promise<ObservationRow> {
    const row = await trx
      .insertInto('observations')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        encounter_id: input.encounterId,
        category: input.category,
        code: input.code,
        display_name: input.displayName,
        value_quantity: input.valueQuantity,
        value_text: input.valueText,
        unit: input.unit,
        status: 'final',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<ObservationRow | null> {
    const row = await trx
      .selectFrom('observations')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByEncounter(trx: Executor, tenantId: string, encounterId: string): Promise<ObservationRow[]> {
    const rows = await trx
      .selectFrom('observations')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('encounter_id', '=', encounterId)
      .orderBy('effective_at', 'asc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['observations']>): ObservationRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    encounterId: dbRow.encounter_id,
    category: dbRow.category,
    code: dbRow.code,
    displayName: dbRow.display_name,
    valueQuantity: dbRow.value_quantity,
    valueText: dbRow.value_text,
    unit: dbRow.unit,
    effectiveAt: dbRow.effective_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
