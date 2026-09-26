import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface ProcedureRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  codeSystem: string | null;
  code: string | null;
  displayName: string;
  performedAt: Date;
  notes: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class ProcedureRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      encounterId: string;
      codeSystem: string | null;
      code: string | null;
      displayName: string;
      notes: string | null;
      createdBy: string;
    },
  ): Promise<ProcedureRow> {
    const row = await trx
      .insertInto('procedures')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        encounter_id: input.encounterId,
        code_system: input.codeSystem,
        code: input.code,
        display_name: input.displayName,
        notes: input.notes,
        status: 'completed',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<ProcedureRow | null> {
    const row = await trx
      .selectFrom('procedures')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByEncounter(trx: Executor, tenantId: string, encounterId: string): Promise<ProcedureRow[]> {
    const rows = await trx
      .selectFrom('procedures')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('encounter_id', '=', encounterId)
      .orderBy('performed_at', 'asc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['procedures']>): ProcedureRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    encounterId: dbRow.encounter_id,
    codeSystem: dbRow.code_system,
    code: dbRow.code,
    displayName: dbRow.display_name,
    performedAt: dbRow.performed_at,
    notes: dbRow.notes,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
