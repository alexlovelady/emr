'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Referral } from '@/lib/types';

export async function createReferral(_prevState: ActionResult<Referral> | null, formData: FormData): Promise<ActionResult<Referral>> {
  const patientId = String(formData.get('patientId') ?? '');
  const referredToPractitionerId = String(formData.get('referredToPractitionerId') ?? '').trim();
  const externalProviderName = String(formData.get('externalProviderName') ?? '').trim();

  const result = await runAction(() =>
    callBackend<Referral>(`/api/v1/patients/${patientId}/referrals`, {
      method: 'POST',
      body: {
        referringPractitionerId: String(formData.get('referringPractitionerId') ?? ''),
        referredToPractitionerId: referredToPractitionerId || undefined,
        externalProviderName: externalProviderName || undefined,
        specialty: String(formData.get('specialty') ?? ''),
        reason: String(formData.get('reason') ?? ''),
        urgency: String(formData.get('urgency') ?? 'routine'),
      },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export async function updateReferralStatus(
  id: string,
  patientId: string,
  status: Referral['status'],
  notes?: string,
): Promise<ActionResult<Referral>> {
  const result = await runAction(() =>
    callBackend<Referral>(`/api/v1/referrals/${id}/status`, { method: 'POST', body: { status, notes: notes?.trim() || undefined } }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
