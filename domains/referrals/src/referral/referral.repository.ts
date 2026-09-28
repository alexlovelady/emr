import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface ReferralRow {
  id: string;
  tenantId: string;
  patientId: string;
  referringPractitionerId: string;
  referredToPractitionerId: string | null;
  externalProviderName: string | null;
  specialty: string;
  reason: string;
  urgency: string;
  notes: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class ReferralRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      referringPractitionerId: string;
      referredToPractitionerId: string | null;
      externalProviderName: string | null;
      specialty: string;
      reason: string;
      urgency: string;
      createdBy: string;
    },
  ): Promise<ReferralRow> {
    const row = await trx
      .insertInto('referrals')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        referring_practitioner_id: input.referringPractitionerId,
        referred_to_practitioner_id: input.referredToPractitionerId,
        external_provider_name: input.externalProviderName,
        specialty: input.specialty,
        reason: input.reason,
        urgency: input.urgency,
        status: 'pending',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<ReferralRow | null> {
    const row = await trx.selectFrom('referrals').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<ReferralRow[]> {
    const rows = await trx
      .selectFrom('referrals')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toRow);
  }

  async updateStatus(trx: Executor, tenantId: string, id: string, status: string, notes: string | null, updatedBy: string): Promise<ReferralRow> {
    const row = await trx
      .updateTable('referrals')
      .set({ status, ...(notes !== null ? { notes } : {}), updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }
}

function toRow(dbRow: Selectable<DB['referrals']>): ReferralRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    referringPractitionerId: dbRow.referring_practitioner_id,
    referredToPractitionerId: dbRow.referred_to_practitioner_id,
    externalProviderName: dbRow.external_provider_name,
    specialty: dbRow.specialty,
    reason: dbRow.reason,
    urgency: dbRow.urgency,
    notes: dbRow.notes,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
