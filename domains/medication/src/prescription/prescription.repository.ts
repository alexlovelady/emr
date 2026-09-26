import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface PrescriptionRow {
  id: string;
  tenantId: string;
  patientId: string;
  medicationId: string;
  encounterId: string | null;
  prescriberId: string;
  pharmacyNcpdpId: string;
  pharmacyName: string;
  quantity: string;
  daysSupply: number | null;
  refillsAuthorized: number;
  refillsRemaining: number;
  directions: string;
  isControlledSubstance: boolean;
  deaSchedule: string | null;
  gatewayReferenceId: string | null;
  sentAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface PrescriptionRefillRequestRow {
  id: string;
  tenantId: string;
  prescriptionId: string;
  requestedAt: Date;
  respondedAt: Date | null;
  respondedBy: string | null;
  denialReason: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class PrescriptionRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      medicationId: string;
      encounterId: string | null;
      prescriberId: string;
      pharmacyNcpdpId: string;
      pharmacyName: string;
      quantity: string;
      daysSupply: number | null;
      refillsAuthorized: number;
      directions: string;
      isControlledSubstance: boolean;
      deaSchedule: string | null;
      gatewayReferenceId: string | null;
      sentAt: Date | null;
      status: string;
      createdBy: string;
    },
  ): Promise<PrescriptionRow> {
    const row = await trx
      .insertInto('prescriptions')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        medication_id: input.medicationId,
        encounter_id: input.encounterId,
        prescriber_id: input.prescriberId,
        pharmacy_ncpdp_id: input.pharmacyNcpdpId,
        pharmacy_name: input.pharmacyName,
        quantity: input.quantity,
        days_supply: input.daysSupply,
        refills_authorized: input.refillsAuthorized,
        refills_remaining: input.refillsAuthorized,
        directions: input.directions,
        is_controlled_substance: input.isControlledSubstance,
        dea_schedule: input.deaSchedule,
        gateway_reference_id: input.gatewayReferenceId,
        sent_at: input.sentAt,
        status: input.status,
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<PrescriptionRow | null> {
    const row = await trx
      .selectFrom('prescriptions')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<PrescriptionRow[]> {
    const rows = await trx
      .selectFrom('prescriptions')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toRow);
  }

  async setStatus(trx: Executor, tenantId: string, id: string, status: string, updatedBy: string): Promise<PrescriptionRow> {
    const row = await trx
      .updateTable('prescriptions')
      .set({ status, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async resetRefillsRemaining(trx: Executor, tenantId: string, id: string, refillsRemaining: number, updatedBy: string): Promise<PrescriptionRow> {
    const row = await trx
      .updateTable('prescriptions')
      .set({ refills_remaining: refillsRemaining, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async createRefillRequest(
    trx: Executor,
    input: { tenantId: string; prescriptionId: string; createdBy: string },
  ): Promise<PrescriptionRefillRequestRow> {
    const row = await trx
      .insertInto('prescription_refill_requests')
      .values({
        tenant_id: input.tenantId,
        prescription_id: input.prescriptionId,
        status: 'pending',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRefillRequestRow(row);
  }

  async findRefillRequestById(trx: Executor, tenantId: string, id: string): Promise<PrescriptionRefillRequestRow | null> {
    const row = await trx
      .selectFrom('prescription_refill_requests')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRefillRequestRow(row) : null;
  }

  async setRefillRequestStatus(
    trx: Executor,
    tenantId: string,
    id: string,
    status: string,
    respondedBy: string,
    denialReason: string | null,
  ): Promise<PrescriptionRefillRequestRow> {
    const row = await trx
      .updateTable('prescription_refill_requests')
      .set({
        status,
        responded_at: new Date(),
        responded_by: respondedBy,
        denial_reason: denialReason,
        updated_by: respondedBy,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRefillRequestRow(row);
  }
}

function toRow(dbRow: Selectable<DB['prescriptions']>): PrescriptionRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    medicationId: dbRow.medication_id,
    encounterId: dbRow.encounter_id,
    prescriberId: dbRow.prescriber_id,
    pharmacyNcpdpId: dbRow.pharmacy_ncpdp_id,
    pharmacyName: dbRow.pharmacy_name,
    quantity: dbRow.quantity,
    daysSupply: dbRow.days_supply,
    refillsAuthorized: dbRow.refills_authorized,
    refillsRemaining: dbRow.refills_remaining,
    directions: dbRow.directions,
    isControlledSubstance: dbRow.is_controlled_substance,
    deaSchedule: dbRow.dea_schedule,
    gatewayReferenceId: dbRow.gateway_reference_id,
    sentAt: dbRow.sent_at,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}

function toRefillRequestRow(dbRow: Selectable<DB['prescription_refill_requests']>): PrescriptionRefillRequestRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    prescriptionId: dbRow.prescription_id,
    requestedAt: dbRow.requested_at,
    respondedAt: dbRow.responded_at,
    respondedBy: dbRow.responded_by,
    denialReason: dbRow.denial_reason,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
