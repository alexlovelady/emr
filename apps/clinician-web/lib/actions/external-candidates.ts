'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { ExternalCandidate } from '@/lib/types';

export async function acceptExternalCandidate(id: string, patientId: string): Promise<ActionResult<ExternalCandidate>> {
  const result = await runAction(() =>
    callBackend<ExternalCandidate>(`/api/v1/external-candidates/${id}/accept`, { method: 'POST' }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export async function rejectExternalCandidate(id: string, patientId: string): Promise<ActionResult<ExternalCandidate>> {
  const result = await runAction(() =>
    callBackend<ExternalCandidate>(`/api/v1/external-candidates/${id}/reject`, { method: 'POST' }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export async function markDuplicateExternalCandidate(id: string, patientId: string): Promise<ActionResult<ExternalCandidate>> {
  const result = await runAction(() =>
    callBackend<ExternalCandidate>(`/api/v1/external-candidates/${id}/mark-duplicate`, { method: 'POST' }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export async function replaceExternalCandidate(
  id: string,
  patientId: string,
  targetResourceId: string,
): Promise<ActionResult<ExternalCandidate>> {
  const result = await runAction(() =>
    callBackend<ExternalCandidate>(`/api/v1/external-candidates/${id}/replace`, {
      method: 'POST',
      body: { targetResourceId },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
