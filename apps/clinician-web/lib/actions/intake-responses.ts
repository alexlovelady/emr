'use server';

import { revalidatePath } from 'next/cache';
import { callBackend, BackendError, SessionExpiredError } from '@/lib/api-proxy';
import type { ActionResult } from './action-result';
import type { IntakeFormResponse } from '@/lib/types';

export async function createIntakeResponse(patientId: string, templateId: string): Promise<ActionResult<IntakeFormResponse>> {
  try {
    const data = await callBackend<IntakeFormResponse>('/api/v1/intake-form-responses', {
      method: 'POST',
      body: { templateId, patientId },
    });
    revalidatePath(`/patients/${patientId}`);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof SessionExpiredError) return { ok: false, error: 'Your session expired. Please sign in again.' };
    if (err instanceof BackendError) return { ok: false, error: err.problem?.title ?? err.message };
    throw err;
  }
}

/** Submit is one-way (draft -> submitted); a 422 carries `problem.detail.missing: string[]` for missing required fields — surfaced inline. */
export async function submitIntakeResponse(
  patientId: string,
  id: string,
  answers: Record<string, unknown>,
): Promise<ActionResult<IntakeFormResponse>> {
  try {
    const data = await callBackend<IntakeFormResponse>(`/api/v1/intake-form-responses/${id}/submit`, {
      method: 'POST',
      body: { answers },
    });
    revalidatePath(`/patients/${patientId}`);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof SessionExpiredError) return { ok: false, error: 'Your session expired. Please sign in again.' };
    if (err instanceof BackendError) {
      const detail = err.problem?.detail;
      const missing = detail && typeof detail === 'object' && 'missing' in detail ? (detail as { missing: string[] }).missing : undefined;
      const error = missing?.length ? `Missing required fields: ${missing.join(', ')}` : (err.problem?.title ?? err.message);
      return { ok: false, error };
    }
    throw err;
  }
}
