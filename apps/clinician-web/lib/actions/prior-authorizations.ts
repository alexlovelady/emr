'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { PriorAuthorization } from '@/lib/types';

export async function createPriorAuthorization(
  _prevState: ActionResult<PriorAuthorization> | null,
  formData: FormData,
): Promise<ActionResult<PriorAuthorization>> {
  const patientId = String(formData.get('patientId') ?? '');
  const notes = String(formData.get('notes') ?? '').trim();

  const result = await runAction(() =>
    callBackend<PriorAuthorization>(`/api/v1/patients/${patientId}/prior-authorizations`, {
      method: 'POST',
      body: {
        coverageId: String(formData.get('coverageId') ?? ''),
        requestedByPractitionerId: String(formData.get('requestedByPractitionerId') ?? ''),
        procedureCode: String(formData.get('procedureCode') ?? ''),
        procedureDescription: String(formData.get('procedureDescription') ?? ''),
        diagnosisCode: String(formData.get('diagnosisCode') ?? ''),
        notes: notes || undefined,
      },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export async function recordPriorAuthDecision(
  id: string,
  patientId: string,
  input: {
    decision: 'approved' | 'denied';
    payerReferenceNumber?: string;
    validFrom?: string;
    validUntil?: string;
    denialReason?: string;
  },
): Promise<ActionResult<PriorAuthorization>> {
  const result = await runAction(() =>
    callBackend<PriorAuthorization>(`/api/v1/prior-authorizations/${id}/decision`, {
      method: 'POST',
      body: {
        decision: input.decision,
        payerReferenceNumber: input.payerReferenceNumber || undefined,
        validFrom: input.validFrom || undefined,
        validUntil: input.validUntil || undefined,
        denialReason: input.denialReason || undefined,
      },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export async function cancelPriorAuthorization(id: string, patientId: string, notes?: string): Promise<ActionResult<PriorAuthorization>> {
  const result = await runAction(() =>
    callBackend<PriorAuthorization>(`/api/v1/prior-authorizations/${id}/cancel`, {
      method: 'POST',
      body: { notes: notes?.trim() || undefined },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
