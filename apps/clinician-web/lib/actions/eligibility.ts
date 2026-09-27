'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { EligibilityCheck } from '@/lib/types';

export async function runEligibilityCheck(patientId: string, coverageId: string): Promise<ActionResult<EligibilityCheck>> {
  const result = await runAction(() =>
    callBackend<EligibilityCheck>(`/api/v1/patients/${patientId}/eligibility-checks`, { method: 'POST', body: { coverageId } }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
