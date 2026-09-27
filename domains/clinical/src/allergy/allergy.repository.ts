import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface AllergyRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string | null;
  substance: string;
  codeSystem: string | null;
  code: string | null;
  reaction: string | null;
  severity: string | null;
  onsetDate: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class AllergyRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      encounterId: string | null;
      substance: string;
      codeSystem: string | null;
      code: string | null;
      reaction: string | null;
      severity: string | null;
      onsetDate: string | null;
      notes: string | null;
      createdBy: string;
    },
  ): Promise<AllergyRow> {
    const row = await trx
      .insertInto('allergies')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        encounter_id: input.encounterId,
        substance: input.substance,
        code_system: input.codeSystem,
        code: input.code,
        reaction: input.reaction,
        severity: input.severity,
        onset_date: input.onsetDate,
        notes: input.notes,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<AllergyRow | null> {
    const row = await trx
      .selectFrom('allergies')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<AllergyRow[]> {
    const rows = await trx
      .selectFrom('allergies')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toRow);
  }
  /** Portal-visible "active allergies" (`@ehr/portal`). */
  async listActiveByPatient(trx: Executor, tenantId: string, patientId: string): Promise<AllergyRow[]> {
    const rows = await trx
      .selectFrom('allergies')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .where('status', '=', 'active')
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['allergies']>): AllergyRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    encounterId: dbRow.encounter_id,
    substance: dbRow.substance,
    codeSystem: dbRow.code_system,
    code: dbRow.code,
    reaction: dbRow.reaction,
    severity: dbRow.severity,
    onsetDate: formatDate(dbRow.onset_date),
    notes: dbRow.notes,
    status: dbRow.status,
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
