'use server';

import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { AiGeneration, CohortExecutionRow } from '@/lib/types';

/**
 * All 8 propose endpoints fetch their own grounding context server-side from the resource id in
 * the URL — request bodies only ever carry free-text instructions/questions. Every one returns the
 * same AiGeneration + provenance shape, reviewed via acceptAiGeneration/rejectAiGeneration below.
 */

export async function proposeNoteDraft(encounterId: string, instructions?: string, audioDocumentId?: string): Promise<ActionResult<AiGeneration>> {
  return runAction(() =>
    callBackend<AiGeneration>(`/api/v1/encounters/${encounterId}/ai/note-draft`, {
      method: 'POST',
      body: { instructions: instructions?.trim() || undefined, audioDocumentId: audioDocumentId || undefined },
    }),
  );
}

export async function proposeEncounterSummary(encounterId: string, instructions?: string): Promise<ActionResult<AiGeneration>> {
  return runAction(() =>
    callBackend<AiGeneration>(`/api/v1/encounters/${encounterId}/ai/summary`, {
      method: 'POST',
      body: { instructions: instructions?.trim() || undefined },
    }),
  );
}

export async function proposeChartQa(patientId: string, question: string): Promise<ActionResult<AiGeneration>> {
  return runAction(() => callBackend<AiGeneration>(`/api/v1/patients/${patientId}/ai/chart-qa`, { method: 'POST', body: { question } }));
}

export async function proposeMessageDraftReply(threadId: string, instructions?: string): Promise<ActionResult<AiGeneration>> {
  return runAction(() =>
    callBackend<AiGeneration>(`/api/v1/message-threads/${threadId}/ai/draft-reply`, {
      method: 'POST',
      body: { instructions: instructions?.trim() || undefined },
    }),
  );
}

export async function proposeCodingSuggestions(encounterId: string, instructions?: string): Promise<ActionResult<AiGeneration>> {
  return runAction(() =>
    callBackend<AiGeneration>(`/api/v1/encounters/${encounterId}/ai/coding-suggestions`, {
      method: 'POST',
      body: { instructions: instructions?.trim() || undefined },
    }),
  );
}

export async function proposeDenialSummary(denialId: string, instructions?: string): Promise<ActionResult<AiGeneration>> {
  return runAction(() =>
    callBackend<AiGeneration>(`/api/v1/denials/${denialId}/ai/summary`, {
      method: 'POST',
      body: { instructions: instructions?.trim() || undefined },
    }),
  );
}

export async function proposeAppealDraft(denialId: string, instructions?: string): Promise<ActionResult<AiGeneration>> {
  return runAction(() =>
    callBackend<AiGeneration>(`/api/v1/denials/${denialId}/ai/appeal-draft`, {
      method: 'POST',
      body: { instructions: instructions?.trim() || undefined },
    }),
  );
}

export async function proposeTaskSummary(
  assignedToUserId: string | undefined,
  patientId: string | undefined,
): Promise<ActionResult<AiGeneration>> {
  return runAction(() =>
    callBackend<AiGeneration>('/api/v1/ai/task-summary', {
      method: 'POST',
      body: { assignedToUserId: assignedToUserId || undefined, patientId: patientId || undefined },
    }),
  );
}

export async function proposeCohortDsl(question: string): Promise<ActionResult<AiGeneration>> {
  return runAction(() => callBackend<AiGeneration>('/api/v1/ai/cohort-dsl', { method: 'POST', body: { question } }));
}

export async function acceptAiGeneration(id: string, editedOutputText?: string): Promise<ActionResult<AiGeneration>> {
  return runAction(() =>
    callBackend<AiGeneration>(`/api/v1/ai-generations/${id}/accept`, {
      method: 'POST',
      body: { editedOutputText: editedOutputText || undefined },
    }),
  );
}

export async function rejectAiGeneration(id: string): Promise<ActionResult<AiGeneration>> {
  return runAction(() => callBackend<AiGeneration>(`/api/v1/ai-generations/${id}/reject`, { method: 'POST' }));
}

/** The one AI feature whose "accept" runs a real (read-only) query — see docs/adr/0004. */
export async function executeCohortDsl(
  generationId: string,
  editedDsl?: Record<string, unknown>,
): Promise<ActionResult<{ generation: AiGeneration; execution: CohortExecutionRow }>> {
  return runAction(() =>
    callBackend<{ generation: AiGeneration; execution: CohortExecutionRow }>(`/api/v1/ai-generations/${generationId}/execute-cohort`, {
      method: 'POST',
      body: { editedDsl: editedDsl ?? undefined },
    }),
  );
}
