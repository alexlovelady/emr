'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { PatientIdentifier } from '@/lib/types';

export async function createIdentifier(
  patientId: string,
  _prevState: ActionResult<PatientIdentifier> | null,
  formData: FormData,
): Promise<ActionResult<PatientIdentifier>> {
  const result = await runAction(() =>
    callBackend<PatientIdentifier>(`/api/v1/patients/${patientId}/identifiers`, {
      method: 'POST',
      body: {
        identifierSystem: String(formData.get('identifierSystem') ?? ''),
        value: String(formData.get('value') ?? ''),
        isPrimary: formData.get('isPrimary') === 'on',
      },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
