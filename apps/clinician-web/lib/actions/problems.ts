'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Problem } from '@/lib/types';

export async function createProblem(_prevState: ActionResult<Problem> | null, formData: FormData): Promise<ActionResult<Problem>> {
  const patientId = String(formData.get('patientId') ?? '');
  const onsetDate = String(formData.get('onsetDate') ?? '');
  const notes = String(formData.get('notes') ?? '');
  const result = await runAction(() =>
    callBackend<Problem>(`/api/v1/patients/${patientId}/problems`, {
      method: 'POST',
      body: {
        codeSystem: String(formData.get('codeSystem') ?? 'ICD-10'),
        code: String(formData.get('code') ?? ''),
        displayName: String(formData.get('displayName') ?? ''),
        ...(onsetDate ? { onsetDate } : {}),
        ...(notes ? { notes } : {}),
      },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export async function updateProblemStatus(id: string, patientId: string, clinicalStatus: 'active' | 'resolved' | 'inactive'): Promise<ActionResult<Problem>> {
  const result = await runAction(() => callBackend<Problem>(`/api/v1/problems/${id}/status`, { method: 'PUT', body: { clinicalStatus } }));
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
