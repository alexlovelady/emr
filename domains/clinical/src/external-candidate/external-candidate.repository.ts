import type { Kysely, Selectable, Transaction } from 'kysely';
import { sql } from 'kysely';
import type { DB } from '@ehr/db';

export interface ExternalCandidateRow {
  id: string;
  tenantId: string;
  patientId: string;
  originType: string;
  sourceDocumentId: string;
  resourceType: string;
  payload: Record<string, unknown>;
  replacesResourceId: string | null;
  createdResourceId: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class ExternalCandidateRepository {
  async create(
    trx: Executor,
    input: {
      tenantId: string;
      patientId: string;
      originType: string;
      sourceDocumentId: string;
      resourceType: string;
      payload: Record<string, unknown>;
      createdBy: string;
    },
  ): Promise<ExternalCandidateRow> {
    const row = await trx
      .insertInto('external_candidates')
      .values({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        origin_type: input.originType,
        source_document_id: input.sourceDocumentId,
        resource_type: input.resourceType,
        payload: JSON.stringify(input.payload),
        status: 'pending',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<ExternalCandidateRow | null> {
    const row = await trx
      .selectFrom('external_candidates')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<ExternalCandidateRow[]> {
    const rows = await trx
      .selectFrom('external_candidates')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('patient_id', '=', patientId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toRow);
  }

  async resolve(
    trx: Executor,
    tenantId: string,
    id: string,
    status: string,
    reviewedBy: string,
    patch: Partial<{ created_resource_id: string; replaces_resource_id: string }> = {},
  ): Promise<ExternalCandidateRow> {
    const row = await trx
      .updateTable('external_candidates')
      .set({ ...patch, status, reviewed_at: new Date(), reviewed_by: reviewedBy, updated_by: reviewedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  /** Stamps a `metadata.supersededByCandidateId` marker on the resource a `replace` action superseded. */
  async markResourceSuperseded(
    trx: Executor,
    tenantId: string,
    resourceType: string,
    resourceId: string,
    supersededByCandidateId: string,
  ): Promise<void> {
    const patchJson = JSON.stringify({ supersededByCandidateId });
    if (resourceType === 'problem') {
      await trx
        .updateTable('problems')
        .set({ metadata: sql`metadata || ${patchJson}::jsonb` })
        .where('tenant_id', '=', tenantId)
        .where('id', '=', resourceId)
        .execute();
    } else if (resourceType === 'allergy') {
      await trx
        .updateTable('allergies')
        .set({ metadata: sql`metadata || ${patchJson}::jsonb` })
        .where('tenant_id', '=', tenantId)
        .where('id', '=', resourceId)
        .execute();
    } else if (resourceType === 'medication') {
      await trx
        .updateTable('medications')
        .set({ metadata: sql`metadata || ${patchJson}::jsonb` })
        .where('tenant_id', '=', tenantId)
        .where('id', '=', resourceId)
        .execute();
    }
  }
}

function toRow(dbRow: Selectable<DB['external_candidates']>): ExternalCandidateRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    patientId: dbRow.patient_id,
    originType: dbRow.origin_type,
    sourceDocumentId: dbRow.source_document_id,
    resourceType: dbRow.resource_type,
    payload: dbRow.payload,
    replacesResourceId: dbRow.replaces_resource_id,
    createdResourceId: dbRow.created_resource_id,
    reviewedAt: dbRow.reviewed_at,
    reviewedBy: dbRow.reviewed_by,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
