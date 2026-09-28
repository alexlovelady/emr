import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface PriorAuthorizationRow {
  id: string;
  tenantId: string;
  patientId: string;
  coverageId: string;
  requestedByPractitionerId: string;
  procedureCode: string;
  procedureDescription: string;
  diagnosisCode: string;
  payerReferenceNumber: string | null;
  validFrom: string | null;
  validUntil: string | null;
  denialReason: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class PriorAuthorizationRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      coverageId: string;
      requestedByPractitionerId: string;
      procedureCode: string;
      procedureDescription: string;
      diagnosisCode: string;
      notes: string | null;
      createdBy: string;
    },
  ): Promise<PriorAuthorizationRow> {
    const row = await trx
      .insertInto('prior_authorizations')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        coverage_id: input.coverageId,
        requested_by_practitioner_id: input.requestedByPractitionerId,
        procedure_code: input.procedureCode,
        procedure_description: input.procedureDescription,
        diagnosis_code: input.diagnosisCode,
        notes: input.notes,
        status: 'pending',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<PriorAuthorizationRow | null> {
    const row = await trx.selectFrom('prior_authorizations').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<PriorAuthorizationRow[]> {
    const rows = await trx
      .selectFrom('prior_authorizations')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toRow);
  }

  async recordDecision(
    trx: Executor,
    tenantId: string,
    id: string,
    input: {
      status: 'approved' | 'denied';
      payerReferenceNumber: string | null;
      validFrom: string | null;
      validUntil: string | null;
      denialReason: string | null;
    },
    updatedBy: string,
  ): Promise<PriorAuthorizationRow> {
    const row = await trx
      .updateTable('prior_authorizations')
      .set({
        status: input.status,
        payer_reference_number: input.payerReferenceNumber,
        valid_from: input.validFrom,
        valid_until: input.validUntil,
        denial_reason: input.denialReason,
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async updateStatus(trx: Executor, tenantId: string, id: string, status: string, notes: string | null, updatedBy: string): Promise<PriorAuthorizationRow> {
    const row = await trx
      .updateTable('prior_authorizations')
      .set({ status, ...(notes !== null ? { notes } : {}), updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['prior_authorizations']>): PriorAuthorizationRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    coverageId: dbRow.coverage_id,
    requestedByPractitionerId: dbRow.requested_by_practitioner_id,
    procedureCode: dbRow.procedure_code,
    procedureDescription: dbRow.procedure_description,
    diagnosisCode: dbRow.diagnosis_code,
    payerReferenceNumber: dbRow.payer_reference_number,
    validFrom: formatDate(dbRow.valid_from),
    validUntil: formatDate(dbRow.valid_until),
    denialReason: dbRow.denial_reason,
    notes: dbRow.notes,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}

function formatDate(value: Date | string | null): string | null {
  if (value === null) return null;
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10);
}
