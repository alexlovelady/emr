import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface CoverageRow {
  id: string;
  tenantId: string;
  patientId: string;
  payerName: string;
  memberId: string;
  groupNumber: string | null;
  planName: string | null;
  coverageType: string;
  effectiveStart: string;
  effectiveEnd: string | null;
  subscriberRelationship: string;
  subscriberName: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class CoverageRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      payerName: string;
      memberId: string;
      groupNumber: string | null;
      planName: string | null;
      coverageType: string;
      effectiveStart: string;
      effectiveEnd: string | null;
      subscriberRelationship: string;
      subscriberName: string | null;
      createdBy: string;
    },
  ): Promise<CoverageRow> {
    const row = await trx
      .insertInto('coverages')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        payer_name: input.payerName,
        member_id: input.memberId,
        group_number: input.groupNumber,
        plan_name: input.planName,
        coverage_type: input.coverageType,
        effective_start: input.effectiveStart,
        effective_end: input.effectiveEnd,
        subscriber_relationship: input.subscriberRelationship,
        subscriber_name: input.subscriberName,
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<CoverageRow | null> {
    const row = await trx
      .selectFrom('coverages')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<CoverageRow[]> {
    const rows = await trx
      .selectFrom('coverages')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('effective_start', 'desc')
      .execute();
    return rows.map(toRow);
  }
}

function toRow(dbRow: Selectable<DB['coverages']>): CoverageRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    payerName: dbRow.payer_name,
    memberId: dbRow.member_id,
    groupNumber: dbRow.group_number,
    planName: dbRow.plan_name,
    coverageType: dbRow.coverage_type,
    effectiveStart: formatDate(dbRow.effective_start),
    effectiveEnd: dbRow.effective_end ? formatDate(dbRow.effective_end) : null,
    subscriberRelationship: dbRow.subscriber_relationship,
    subscriberName: dbRow.subscriber_name,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}

function formatDate(value: Date | string): string {
  if (typeof value === 'string') return value;
  return value.toISOString().slice(0, 10);
}
