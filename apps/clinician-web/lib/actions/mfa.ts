'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { MfaEnrollment } from '@/lib/types';

export async function startMfaEnrollment(): Promise<ActionResult<MfaEnrollment>> {
  return runAction(() => callBackend<MfaEnrollment>('/api/v1/auth/mfa/enroll', { method: 'POST' }));
}

export async function confirmMfaEnrollment(
  _prevState: ActionResult<{ ok: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ ok: true }>> {
  const code = String(formData.get('code') ?? '');
  const result = await runAction(() => callBackend<{ ok: true }>('/api/v1/auth/mfa/confirm', { method: 'POST', body: { code } }));
  if (result.ok) revalidatePath('/settings/security');
  return result;
}
