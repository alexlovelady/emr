import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface IntakeFormResponseRow {
  id: string;
  tenantId: string;
  templateId: string;
  patientId: string;
  appointmentId: string | null;
  answers: Record<string, unknown>;
  submittedAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class IntakeFormResponseRepository {
  async create(
    trx: Executor,
    input: { tenantId: string; templateId: string; patientId: string; appointmentId: string | null; createdBy: string },
  ): Promise<IntakeFormResponseRow> {
    const row = await trx
      .insertInto('intake_form_responses')
      .values({
        tenant_id: input.tenantId,
        template_id: input.templateId,
        patient_id: input.patientId,
        appointment_id: input.appointmentId,
        status: 'draft',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<IntakeFormResponseRow | null> {
    const row = await trx
      .selectFrom('intake_form_responses')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async list(trx: Executor, tenantId: string, filter: { patientId?: string } = {}): Promise<IntakeFormResponseRow[]> {
    let query = trx.selectFrom('intake_form_responses').selectAll().where('tenant_id', '=', tenantId);
    if (filter.patientId) query = query.where('patient_id', '=', filter.patientId);
    const rows = await query.orderBy('created_at', 'desc').execute();
    return rows.map(toRow);
  }

  async submit(
    trx: Executor,
    tenantId: string,
    id: string,
    answers: Record<string, unknown>,
    updatedBy: string,
  ): Promise<IntakeFormResponseRow> {
    const row = await trx
      .updateTable('intake_form_responses')
      .set({
        answers: JSON.stringify(answers),
        status: 'submitted',
        submitted_at: new Date(),
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['intake_form_responses']>): IntakeFormResponseRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    templateId: dbRow.template_id,
    patientId: dbRow.patient_id,
    appointmentId: dbRow.appointment_id,
    answers: dbRow.answers,
    submittedAt: dbRow.submitted_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
