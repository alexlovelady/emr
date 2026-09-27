'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Coverage } from '@/lib/types';

export async function createCoverage(patientId: string, _prevState: ActionResult<Coverage> | null, formData: FormData): Promise<ActionResult<Coverage>> {
  const groupNumber = String(formData.get('groupNumber') ?? '');
  const planName = String(formData.get('planName') ?? '');
  const effectiveEnd = String(formData.get('effectiveEnd') ?? '');
  const result = await runAction(() =>
    callBackend<Coverage>(`/api/v1/patients/${patientId}/coverages`, {
      method: 'POST',
      body: {
        payerName: String(formData.get('payerName') ?? ''),
        memberId: String(formData.get('memberId') ?? ''),
        coverageType: String(formData.get('coverageType') ?? 'primary'),
        effectiveStart: String(formData.get('effectiveStart') ?? ''),
        ...(groupNumber ? { groupNumber } : {}),
        ...(planName ? { planName } : {}),
        ...(effectiveEnd ? { effectiveEnd } : {}),
      },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
