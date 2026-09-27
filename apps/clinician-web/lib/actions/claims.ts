'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Claim } from '@/lib/types';

export async function createClaim(_prevState: ActionResult<Claim> | null, formData: FormData): Promise<ActionResult<Claim>> {
  const patientId = String(formData.get('patientId') ?? '');
  const encounterId = String(formData.get('encounterId') ?? '');
  const coverageId = String(formData.get('coverageId') ?? '');
  const chargeIds = formData.getAll('chargeIds').map(String);

  const result = await runAction(() =>
    callBackend<Claim>(`/api/v1/patients/${patientId}/claims`, {
      method: 'POST',
      body: {
        encounterId,
        billingPractitionerId: String(formData.get('billingPractitionerId') ?? ''),
        chargeIds,
        ...(coverageId ? { coverageId } : {}),
      },
    }),
  );
  if (result.ok) revalidatePath(`/encounters/${encounterId}`);
  return result;
}

export async function submitClaim(id: string, patientId: string): Promise<ActionResult<Claim>> {
  const result = await runAction(() => callBackend<Claim>(`/api/v1/claims/${id}/submit`, { method: 'POST' }));
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
