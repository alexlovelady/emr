'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { CohortBreakdownDimension, CohortBreakdownResult, CohortDsl, CohortExecutionRow, CohortPreviewResult, CohortRow } from '@/lib/types';

export async function saveCohort(name: string, description: string, dsl: CohortDsl): Promise<ActionResult<CohortRow>> {
  const result = await runAction(() =>
    callBackend<CohortRow>('/api/v1/cohorts', { method: 'POST', body: { name, description: description || undefined, dsl } }),
  );
  if (result.ok) revalidatePath('/reports/cohorts');
  return result;
}

export async function executeAdHocCohort(dsl: CohortDsl): Promise<ActionResult<CohortExecutionRow>> {
  return runAction(() => callBackend<CohortExecutionRow>('/api/v1/cohorts/execute', { method: 'POST', body: { dsl } }));
}

export async function executeSavedCohort(cohortId: string): Promise<ActionResult<CohortExecutionRow>> {
  const result = await runAction(() => callBackend<CohortExecutionRow>(`/api/v1/cohorts/${cohortId}/execute`, { method: 'POST' }));
  if (result.ok) revalidatePath(`/reports/cohorts/${cohortId}`);
  return result;
}

export async function exportCohortExecution(executionId: string): Promise<ActionResult<{ downloadUrl: string }>> {
  return runAction(() => callBackend<{ downloadUrl: string }>(`/api/v1/cohort-executions/${executionId}/export`, { method: 'POST' }));
}

/** Item 1 (Epic-parity build-out) — a live, unpersisted count as a filter set is being edited. */
export async function previewCohort(dsl: CohortDsl): Promise<ActionResult<CohortPreviewResult>> {
  return runAction(() => callBackend<CohortPreviewResult>('/api/v1/cohorts/preview', { method: 'POST', body: { dsl } }));
}

/** Item 1 — aggregate-only "slice" of the matched population by one fixed dimension. */
export async function executeCohortBreakdown(dsl: CohortDsl, groupBy: CohortBreakdownDimension): Promise<ActionResult<CohortBreakdownResult>> {
  return runAction(() => callBackend<CohortBreakdownResult>('/api/v1/cohorts/breakdown', { method: 'POST', body: { dsl, groupBy } }));
}
