import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';

export interface CohortRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  dslPayload: Record<string, unknown>;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface CohortExecutionRow {
  id: string;
  tenantId: string;
  cohortId: string | null;
  dslPayload: Record<string, unknown>;
  estimatedRows: number | null;
  resultPatientIds: string[];
  resultCount: number;
  executedAt: Date;
  exportStorageKey: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export class CohortRepository {
  async create(
    trx: Executor,
    input: { tenantId: string; name: string; description: string | null; dslPayload: Record<string, unknown>; createdBy: string },
  ): Promise<CohortRow> {
    const row = await trx
      .insertInto('cohorts')
      .values({
        tenant_id: input.tenantId,
        name: input.name,
        description: input.description,
        dsl_payload: JSON.stringify(input.dslPayload),
        status: 'active',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toCohortRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<CohortRow | null> {
    const row = await trx.selectFrom('cohorts').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
    return row ? toCohortRow(row) : null;
  }

  async list(trx: Executor, tenantId: string): Promise<CohortRow[]> {
    const rows = await trx.selectFrom('cohorts').selectAll().where('tenant_id', '=', tenantId).orderBy('created_at', 'desc').execute();
    return rows.map(toCohortRow);
  }

  async createExecution(
    trx: Executor,
    input: {
      tenantId: string;
      cohortId: string | null;
      dslPayload: Record<string, unknown>;
      estimatedRows: number | null;
      resultPatientIds: string[];
      resultCount: number;
      createdBy: string;
    },
  ): Promise<CohortExecutionRow> {
    const row = await trx
      .insertInto('cohort_executions')
      .values({
        tenant_id: input.tenantId,
        cohort_id: input.cohortId,
        dsl_payload: JSON.stringify(input.dslPayload),
        estimated_rows: input.estimatedRows,
        result_patient_ids: input.resultPatientIds,
        result_count: input.resultCount,
        status: 'completed',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toExecutionRow(row);
  }

  async findExecutionById(trx: Executor, tenantId: string, id: string): Promise<CohortExecutionRow | null> {
    const row = await trx
      .selectFrom('cohort_executions')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toExecutionRow(row) : null;
  }

  async listExecutionsByCohort(trx: Executor, tenantId: string, cohortId: string): Promise<CohortExecutionRow[]> {
    const rows = await trx
      .selectFrom('cohort_executions')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('cohort_id', '=', cohortId)
      .orderBy('executed_at', 'desc')
      .execute();
    return rows.map(toExecutionRow);
  }

  async setExportStorageKey(trx: Executor, tenantId: string, id: string, storageKey: string, updatedBy: string): Promise<CohortExecutionRow> {
    const row = await trx
      .updateTable('cohort_executions')
      .set({ export_storage_key: storageKey, updated_by: updatedBy, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toExecutionRow(row);
  }
}

function toCohortRow(dbRow: Selectable<DB['cohorts']>): CohortRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    name: dbRow.name,
    description: dbRow.description,
    dslPayload: dbRow.dsl_payload,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}

function toExecutionRow(dbRow: Selectable<DB['cohort_executions']>): CohortExecutionRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    cohortId: dbRow.cohort_id,
    dslPayload: dbRow.dsl_payload,
    estimatedRows: dbRow.estimated_rows,
    resultPatientIds: dbRow.result_patient_ids,
    resultCount: dbRow.result_count,
    executedAt: dbRow.executed_at,
    exportStorageKey: dbRow.export_storage_key,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
