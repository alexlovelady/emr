'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Appeal } from '@/lib/types';

export async function createAppeal(
  denialId: string,
  patientId: string,
  appealReason: string,
  sourceAiGenerationId?: string,
): Promise<ActionResult<Appeal>> {
  const result = await runAction(() =>
    callBackend<Appeal>(`/api/v1/denials/${denialId}/appeals`, {
      method: 'POST',
      body: { appealReason, sourceAiGenerationId: sourceAiGenerationId || undefined },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export async function submitAppeal(appealId: string, patientId: string): Promise<ActionResult<Appeal>> {
  const result = await runAction(() => callBackend<Appeal>(`/api/v1/appeals/${appealId}/submit`, { method: 'POST' }));
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export async function decideAppeal(
  appealId: string,
  patientId: string,
  outcome: 'won' | 'lost',
  decisionNotes: string,
): Promise<ActionResult<Appeal>> {
  const result = await runAction(() =>
    callBackend<Appeal>(`/api/v1/appeals/${appealId}/decide`, { method: 'POST', body: { outcome, decisionNotes } }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
