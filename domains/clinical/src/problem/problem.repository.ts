import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface ProblemRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string | null;
  codeSystem: string;
  code: string;
  displayName: string;
  clinicalStatus: string;
  onsetDate: string | null;
  notes: string | null;
  sensitivity: string | null;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class ProblemRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      encounterId: string | null;
      codeSystem: string;
      code: string;
      displayName: string;
      onsetDate: string | null;
      notes: string | null;
      sensitivity: string | null;
      createdBy: string;
    },
  ): Promise<ProblemRow> {
    const row = await trx
      .insertInto('problems')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        encounter_id: input.encounterId,
        code_system: input.codeSystem,
        code: input.code,
        display_name: input.displayName,
        clinical_status: 'active',
        onset_date: input.onsetDate,
        notes: input.notes,
        sensitivity: input.sensitivity,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<ProblemRow | null> {
    const row = await trx
      .selectFrom('problems')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<ProblemRow[]> {
    const rows = await trx
      .selectFrom('problems')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toRow);
  }

  /** Every problem in the tenant, not scoped to one patient — backs bulk FHIR `$export`. */
  async listAll(trx: Executor, tenantId: string, filter: { since?: Date } = {}): Promise<ProblemRow[]> {
    let query = trx.selectFrom('problems').selectAll().where('tenant_id', '=', tenantId);
    if (filter.since) query = query.where('updated_at', '>=', filter.since);
    const rows = await query.orderBy('id', 'asc').execute();
    return rows.map(toRow);
  }

  /** Portal-visible "active problems" (`@ehr/portal`). */
  async listActiveByPatient(trx: Executor, tenantId: string, patientId: string): Promise<ProblemRow[]> {
    const rows = await trx
      .selectFrom('problems')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .where('clinical_status', '=', 'active')
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toRow);
  }

  async setClinicalStatus(trx: Executor, tenantId: string, id: string, clinicalStatus: string, updatedBy: string): Promise<ProblemRow> {
    const row = await trx
      .updateTable('problems')
      .set({ clinical_status: clinicalStatus, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['problems']>): ProblemRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    encounterId: dbRow.encounter_id,
    codeSystem: dbRow.code_system,
    code: dbRow.code,
    displayName: dbRow.display_name,
    clinicalStatus: dbRow.clinical_status,
    onsetDate: formatDate(dbRow.onset_date),
    notes: dbRow.notes,
    sensitivity: dbRow.sensitivity,
    status: dbRow.status,
    metadata: dbRow.metadata,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}

function formatDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  return value.toISOString().slice(0, 10);
}
