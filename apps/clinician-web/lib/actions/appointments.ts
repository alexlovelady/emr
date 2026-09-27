'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Appointment } from '@/lib/types';

export async function createAppointment(_prevState: ActionResult<Appointment> | null, formData: FormData): Promise<ActionResult<Appointment>> {
  const result = await runAction(() =>
    callBackend<Appointment>('/api/v1/appointments', {
      method: 'POST',
      body: {
        patientId: String(formData.get('patientId') ?? ''),
        locationId: String(formData.get('locationId') ?? ''),
        practitionerId: String(formData.get('practitionerId') ?? ''),
        appointmentType: String(formData.get('appointmentType') ?? ''),
        scheduledStart: new Date(String(formData.get('scheduledStart') ?? '')).toISOString(),
        scheduledEnd: new Date(String(formData.get('scheduledEnd') ?? '')).toISOString(),
      },
    }),
  );
  if (result.ok) revalidatePath('/schedule');
  return result;
}

export async function confirmAppointment(id: string): Promise<ActionResult<Appointment>> {
  const result = await runAction(() => callBackend<Appointment>(`/api/v1/appointments/${id}/confirm`, { method: 'POST' }));
  if (result.ok) revalidatePath('/schedule');
  return result;
}

export async function checkInAppointment(id: string): Promise<ActionResult<Appointment>> {
  const result = await runAction(() => callBackend<Appointment>(`/api/v1/appointments/${id}/check-in`, { method: 'POST' }));
  if (result.ok) revalidatePath('/schedule');
  return result;
}

export async function cancelAppointment(id: string, reason?: string): Promise<ActionResult<Appointment>> {
  const result = await runAction(() =>
    callBackend<Appointment>(`/api/v1/appointments/${id}/cancel`, { method: 'POST', body: reason ? { reason } : {} }),
  );
  if (result.ok) revalidatePath('/schedule');
  return result;
}

export async function markNoShow(id: string): Promise<ActionResult<Appointment>> {
  const result = await runAction(() => callBackend<Appointment>(`/api/v1/appointments/${id}/no-show`, { method: 'POST' }));
  if (result.ok) revalidatePath('/schedule');
  return result;
}
