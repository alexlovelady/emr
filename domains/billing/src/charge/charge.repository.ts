import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface ChargeRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  billingPractitionerId: string;
  codeSystem: string;
  code: string;
  description: string;
  units: number;
  unitPrice: string;
  diagnosisCodes: string[];
  claimId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class ChargeRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      encounterId: string;
      billingPractitionerId: string;
      codeSystem: string;
      code: string;
      description: string;
      units: number;
      unitPrice: string;
      diagnosisCodes: string[];
      createdBy: string;
    },
  ): Promise<ChargeRow> {
    const row = await trx
      .insertInto('charges')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        encounter_id: input.encounterId,
        billing_practitioner_id: input.billingPractitionerId,
        code_system: input.codeSystem,
        code: input.code,
        description: input.description,
        units: input.units,
        unit_price: input.unitPrice,
        diagnosis_codes: input.diagnosisCodes,
        status: 'draft',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<ChargeRow | null> {
    const row = await trx
      .selectFrom('charges')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async findByIds(trx: Executor, tenantId: string, ids: string[]): Promise<ChargeRow[]> {
    if (ids.length === 0) return [];
    const rows = await trx.selectFrom('charges').selectAll().where('tenant_id', '=', tenantId).where('id', 'in', ids).execute();
    return rows.map(toRow);
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<ChargeRow[]> {
    const rows = await trx
      .selectFrom('charges')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toRow);
  }

  async listByClaim(trx: Executor, tenantId: string, claimId: string): Promise<ChargeRow[]> {
    const rows = await trx.selectFrom('charges').selectAll().where('tenant_id', '=', tenantId).where('claim_id', '=', claimId).execute();
    return rows.map(toRow);
  }

  async listCodingQueue(trx: Executor, tenantId: string): Promise<ChargeRow[]> {
    const rows = await trx
      .selectFrom('charges')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'draft')
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toRow);
  }

  async finalizeCoding(
    trx: Executor,
    tenantId: string,
    id: string,
    input: { codeSystem: string; code: string; description: string; diagnosisCodes: string[] },
    updatedBy: string,
  ): Promise<ChargeRow> {
    const row = await trx
      .updateTable('charges')
      .set({
        code_system: input.codeSystem,
        code: input.code,
        description: input.description,
        diagnosis_codes: input.diagnosisCodes,
        status: 'coded',
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async markBilled(trx: Executor, tenantId: string, ids: string[], claimId: string, updatedBy: string): Promise<void> {
    if (ids.length === 0) return;
    await trx
      .updateTable('charges')
      .set({ status: 'billed', claim_id: claimId, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', 'in', ids)
      .execute();
  }
}

function toRow(dbRow: Selectable<DB['charges']>): ChargeRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    encounterId: dbRow.encounter_id,
    billingPractitionerId: dbRow.billing_practitioner_id,
    codeSystem: dbRow.code_system,
    code: dbRow.code,
    description: dbRow.description,
    units: dbRow.units,
    unitPrice: dbRow.unit_price,
    diagnosisCodes: dbRow.diagnosis_codes,
    claimId: dbRow.claim_id,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
