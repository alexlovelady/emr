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
  orderId: string | null;
  specimenId: string | null;
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
      orderId?: string | null;
      specimenId?: string | null;
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
        order_id: input.orderId ?? null,
        specimen_id: input.specimenId ?? null,
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

  /** Patient-scoped (not just per-encounter) — backs `apps/interop-fhir`'s `/fhir/r4/Observation?patient=` search. */
  async listByPatient(trx: Executor, tenantId: string, patientId: string, filter: { category?: string } = {}): Promise<ObservationRow[]> {
    let query = trx.selectFrom('observations').selectAll().where('tenant_id', '=', tenantId).where('patient_id', '=', patientId);
    if (filter.category) query = query.where('category', '=', filter.category);
    const rows = await query.orderBy('effective_at', 'desc').execute();
    return rows.map(toRow);
  }

  /** Every observation in the tenant, not scoped to one patient — backs bulk FHIR `$export`. */
  async listAll(trx: Executor, tenantId: string, filter: { since?: Date } = {}): Promise<ObservationRow[]> {
    let query = trx.selectFrom('observations').selectAll().where('tenant_id', '=', tenantId);
    if (filter.since) query = query.where('updated_at', '>=', filter.since);
    const rows = await query.orderBy('id', 'asc').execute();
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
    orderId: dbRow.order_id,
    specimenId: dbRow.specimen_id,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
