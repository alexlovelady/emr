'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Patient } from '@/lib/types';

export interface UpdateContactInput {
  phone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export async function updateContactInfo(patientId: string, input: UpdateContactInput): Promise<ActionResult<Patient>> {
  const result = await runAction(() =>
    callBackend<Patient>(`/api/v1/portal/patients/${patientId}/profile`, { method: 'PATCH', body: input }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
