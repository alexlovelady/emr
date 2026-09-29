'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Allergy } from '@/lib/types';

export async function createAllergy(_prevState: ActionResult<Allergy> | null, formData: FormData): Promise<ActionResult<Allergy>> {
  const patientId = String(formData.get('patientId') ?? '');
  const reaction = String(formData.get('reaction') ?? '');
  const severity = String(formData.get('severity') ?? '');
  const onsetDate = String(formData.get('onsetDate') ?? '');
  const result = await runAction(() =>
    callBackend<Allergy>(`/api/v1/patients/${patientId}/allergies`, {
      method: 'POST',
      body: {
        substance: String(formData.get('substance') ?? ''),
        ...(reaction ? { reaction } : {}),
        ...(severity ? { severity } : {}),
        ...(onsetDate ? { onsetDate } : {}),
      },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export async function updateAllergy(
  id: string,
  patientId: string,
  input: { reaction?: string; severity?: string; onsetDate?: string; notes?: string },
): Promise<ActionResult<Allergy>> {
  const result = await runAction(() =>
    callBackend<Allergy>(`/api/v1/allergies/${id}`, {
      method: 'PUT',
      body: {
        reaction: input.reaction || undefined,
        severity: input.severity || undefined,
        onsetDate: input.onsetDate || undefined,
        notes: input.notes || undefined,
      },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export async function resolveAllergy(id: string, patientId: string): Promise<ActionResult<Allergy>> {
  const result = await runAction(() => callBackend<Allergy>(`/api/v1/allergies/${id}/resolve`, { method: 'POST' }));
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
