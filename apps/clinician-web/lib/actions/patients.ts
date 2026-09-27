'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Patient, PatientMergeHistory } from '@/lib/types';

export async function createPatient(_prevState: ActionResult<Patient> | null, formData: FormData): Promise<ActionResult<Patient>> {
  const optionalFields = ['middleName', 'sexAtBirth', 'genderIdentity', 'phone', 'email', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country', 'preferredLanguage'];
  const body: Record<string, string> = {
    givenName: String(formData.get('givenName') ?? ''),
    familyName: String(formData.get('familyName') ?? ''),
    dateOfBirth: String(formData.get('dateOfBirth') ?? ''),
  };
  for (const field of optionalFields) {
    const value = formData.get(field);
    if (value) body[field] = String(value);
  }

  const result = await runAction(() => callBackend<Patient>('/api/v1/patients', { method: 'POST', body }));
  if (result.ok) revalidatePath('/patients');
  return result;
}

export async function mergePatient(sourcePatientId: string, targetPatientId: string): Promise<ActionResult<PatientMergeHistory>> {
  const result = await runAction(() =>
    callBackend<PatientMergeHistory>(`/api/v1/patients/${targetPatientId}/merge`, { method: 'POST', body: { sourcePatientId } }),
  );
  if (result.ok) {
    revalidatePath('/patients');
    revalidatePath(`/patients/${targetPatientId}`);
  }
  return result;
}
