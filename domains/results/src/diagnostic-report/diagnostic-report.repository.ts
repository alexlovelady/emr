import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface DiagnosticReportRow {
  id: string;
  tenantId: string;
  orderId: string | null;
  patientId: string;
  encounterId: string;
  codeSystem: string | null;
  code: string | null;
  displayName: string;
  conclusion: string | null;
  performingLab: string | null;
  issuedAt: Date;
  criticalFlag: boolean;
  abnormalFlag: boolean;
  reviewStatus: string;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  amendsReportId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class DiagnosticReportRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      orderId: string | null;
      patientId: string;
      encounterId: string;
      codeSystem: string | null;
      code: string | null;
      displayName: string;
      conclusion: string | null;
      performingLab: string | null;
      criticalFlag: boolean;
      abnormalFlag: boolean;
      amendsReportId: string | null;
      createdBy: string;
    },
  ): Promise<DiagnosticReportRow> {
    const row = await trx
      .insertInto('diagnostic_reports')
      .values({
        tenant_id: input.tenantId,
        order_id: input.orderId,
        patient_id: input.patientId,
        encounter_id: input.encounterId,
        code_system: input.codeSystem,
        code: input.code,
        display_name: input.displayName,
        conclusion: input.conclusion,
        performing_lab: input.performingLab,
        critical_flag: input.criticalFlag,
        abnormal_flag: input.abnormalFlag,
        amends_report_id: input.amendsReportId,
        status: 'final',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<DiagnosticReportRow | null> {
    const row = await trx
      .selectFrom('diagnostic_reports')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<DiagnosticReportRow[]> {
    const rows = await trx
      .selectFrom('diagnostic_reports')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('issued_at', 'desc')
      .execute();
    return rows.map(toRow);
  }

  async listInbox(trx: Executor, tenantId: string): Promise<DiagnosticReportRow[]> {
    const rows = await trx
      .selectFrom('diagnostic_reports')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('review_status', '=', 'pending')
      .orderBy('issued_at', 'asc')
      .execute();
    return rows.map(toRow);
  }

  async markReviewed(
    trx: Executor,
    tenantId: string,
    id: string,
    reviewStatus: string,
    reviewedBy: string,
  ): Promise<DiagnosticReportRow> {
    const row = await trx
      .updateTable('diagnostic_reports')
      .set({ review_status: reviewStatus, reviewed_at: new Date(), reviewed_by: reviewedBy, updated_by: reviewedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findByOrderId(trx: Executor, tenantId: string, orderId: string): Promise<DiagnosticReportRow[]> {
    const rows = await trx
      .selectFrom('diagnostic_reports')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('order_id', '=', orderId)
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['diagnostic_reports']>): DiagnosticReportRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    orderId: dbRow.order_id,
    patientId: dbRow.patient_id,
    encounterId: dbRow.encounter_id,
    codeSystem: dbRow.code_system,
    code: dbRow.code,
    displayName: dbRow.display_name,
    conclusion: dbRow.conclusion,
    performingLab: dbRow.performing_lab,
    issuedAt: dbRow.issued_at,
    criticalFlag: dbRow.critical_flag,
    abnormalFlag: dbRow.abnormal_flag,
    reviewStatus: dbRow.review_status,
    reviewedAt: dbRow.reviewed_at,
    reviewedBy: dbRow.reviewed_by,
    amendsReportId: dbRow.amends_report_id,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
