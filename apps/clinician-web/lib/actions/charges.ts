'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Charge } from '@/lib/types';

export async function createCharge(_prevState: ActionResult<Charge> | null, formData: FormData): Promise<ActionResult<Charge>> {
  const patientId = String(formData.get('patientId') ?? '');
  const encounterId = String(formData.get('encounterId') ?? '');
  const diagnosisCodes = String(formData.get('diagnosisCodes') ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  const result = await runAction(() =>
    callBackend<Charge>(`/api/v1/patients/${patientId}/charges`, {
      method: 'POST',
      body: {
        encounterId,
        billingPractitionerId: String(formData.get('billingPractitionerId') ?? ''),
        codeSystem: String(formData.get('codeSystem') ?? 'CPT'),
        code: String(formData.get('code') ?? ''),
        description: String(formData.get('description') ?? ''),
        units: Number(formData.get('units') ?? 1),
        unitPrice: Number(formData.get('unitPrice') ?? 0),
        diagnosisCodes,
      },
    }),
  );
  if (result.ok) revalidatePath(`/encounters/${encounterId}`);
  return result;
}

export async function finalizeCoding(
  id: string,
  fields: { codeSystem?: string; code?: string; description?: string; diagnosisCodes?: string[] },
): Promise<ActionResult<Charge>> {
  const result = await runAction(() => callBackend<Charge>(`/api/v1/charges/${id}/finalize-coding`, { method: 'POST', body: fields }));
  if (result.ok) revalidatePath('/coding-queue');
  return result;
}
