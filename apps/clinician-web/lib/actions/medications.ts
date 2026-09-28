'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { MedicationItem, MedicationCreateResult } from '@/lib/types';

export async function createMedication(
  _prevState: ActionResult<MedicationCreateResult> | null,
  formData: FormData,
): Promise<ActionResult<MedicationCreateResult>> {
  const patientId = String(formData.get('patientId') ?? '');
  const dose = String(formData.get('dose') ?? '');
  const route = String(formData.get('route') ?? '');
  const frequency = String(formData.get('frequency') ?? '');
  const result = await runAction(() =>
    callBackend<MedicationCreateResult>(`/api/v1/patients/${patientId}/medications`, {
      method: 'POST',
      body: {
        medicationName: String(formData.get('medicationName') ?? ''),
        sourceType: 'clinician_entered',
        ...(dose ? { dose } : {}),
        ...(route ? { route } : {}),
        ...(frequency ? { frequency } : {}),
      },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export async function discontinueMedication(id: string, patientId: string): Promise<ActionResult<MedicationItem>> {
  // The backend's DiscontinueMedicationSchema is a Zod object with only optional fields — Zod
  // still requires the top-level body to BE an object, so `{}` must be sent explicitly rather
  // than omitting the body entirely (which Fastify/Zod treats as `undefined`, not `{}`).
  const result = await runAction(() => callBackend<MedicationItem>(`/api/v1/medications/${id}/discontinue`, { method: 'POST', body: {} }));
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
