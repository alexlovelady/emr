import type { Kysely, Selectable, Transaction } from 'kysely';
import type { DB } from '@ehr/db';
import type { AiProvenance } from './ai-generation.dto.js';

export interface AiGenerationRow {
  id: string;
  tenantId: string;
  feature: string;
  patientId: string | null;
  subjectType: string | null;
  subjectId: string | null;
  inputText: string;
  contextRefs: string[];
  modelProvider: string;
  modelId: string;
  modelVersion: string;
  promptTemplateVersion: string;
  outputText: string;
  outputJson: Record<string, unknown> | null;
  outputHash: string;
  generatedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  editedOutputText: string | null;
  linkedCohortExecutionId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type Executor = Kysely<DB> | Transaction<DB>;

export interface CreateAiGenerationRecord {
  tenantId: string;
  feature: string;
  patientId: string | null;
  subjectType: string | null;
  subjectId: string | null;
  inputText: string;
  contextRefs: string[];
  modelProvider: string;
  modelId: string;
  modelVersion: string;
  promptTemplateVersion: string;
  outputText: string;
  outputJson: Record<string, unknown> | null;
  outputHash: string;
  generatedAt: string;
  createdBy: string;
}

export class AiGenerationRepository {
  async create(trx: Executor, input: CreateAiGenerationRecord): Promise<AiGenerationRow> {
    const row = await trx
      .insertInto('ai_generations')
      .values({
        tenant_id: input.tenantId,
        feature: input.feature,
        patient_id: input.patientId,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        input_text: input.inputText,
        context_refs: JSON.stringify(input.contextRefs),
        model_provider: input.modelProvider,
        model_id: input.modelId,
        model_version: input.modelVersion,
        prompt_template_version: input.promptTemplateVersion,
        output_text: input.outputText,
        output_json: input.outputJson ? JSON.stringify(input.outputJson) : null,
        output_hash: input.outputHash,
        generated_at: input.generatedAt,
        status: 'pending',
        created_by: input.createdBy,
        updated_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async findById(trx: Executor, tenantId: string, id: string): Promise<AiGenerationRow | null> {
    const row = await trx
      .selectFrom('ai_generations')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRow(row) : null;
  }

  async listByPatient(trx: Executor, tenantId: string, patientId: string): Promise<AiGenerationRow[]> {
    const rows = await trx
      .selectFrom('ai_generations')
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
    status: 'accepted' | 'accepted_with_edits' | 'rejected',
    reviewedBy: string,
    editedOutputText: string | null,
  ): Promise<AiGenerationRow> {
    const row = await trx
      .updateTable('ai_generations')
      .set({
        status,
        reviewed_at: new Date(),
        reviewed_by: reviewedBy,
        edited_output_text: editedOutputText,
        updated_by: reviewedBy,
        updated_at: new Date(),
      })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toRow(row);
  }

  async setLinkedCohortExecution(trx: Executor, tenantId: string, id: string, cohortExecutionId: string): Promise<void> {
    await trx
      .updateTable('ai_generations')
      .set({ linked_cohort_execution_id: cohortExecutionId, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .where('id', '=', id)
      .execute();
  }
}

export function toProvenance(row: AiGenerationRow): AiProvenance {
  return {
    model_provider: row.modelProvider,
    model_id: row.modelId,
    model_version: row.modelVersion,
    prompt_template_version: row.promptTemplateVersion,
    source_refs: row.contextRefs,
    generated_at: row.generatedAt.toISOString(),
    output_hash: row.outputHash,
    reviewer_id: row.reviewedBy,
    decision: row.status as AiProvenance['decision'],
  };
}

function toRow(dbRow: Selectable<DB['ai_generations']>): AiGenerationRow {
  return {
    id: dbRow.id,
    tenantId: dbRow.tenant_id,
    feature: dbRow.feature,
    patientId: dbRow.patient_id,
    subjectType: dbRow.subject_type,
    subjectId: dbRow.subject_id,
    inputText: dbRow.input_text,
    contextRefs: dbRow.context_refs as string[],
    modelProvider: dbRow.model_provider,
    modelId: dbRow.model_id,
    modelVersion: dbRow.model_version,
    promptTemplateVersion: dbRow.prompt_template_version,
    outputText: dbRow.output_text,
    outputJson: dbRow.output_json,
    outputHash: dbRow.output_hash,
    generatedAt: dbRow.generated_at,
    reviewedAt: dbRow.reviewed_at,
    reviewedBy: dbRow.reviewed_by,
    editedOutputText: dbRow.edited_output_text,
    linkedCohortExecutionId: dbRow.linked_cohort_execution_id,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    version: Number(dbRow.version),
  };
}
