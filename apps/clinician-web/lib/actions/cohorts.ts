'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { CohortDsl, CohortExecutionRow, CohortRow } from '@/lib/types';

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
