'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Appointment } from '@/lib/types';

function parseResourceIds(formData: FormData): string[] {
  return formData.getAll('resourceIds').map(String).filter(Boolean);
}

export async function createAppointment(_prevState: ActionResult<Appointment> | null, formData: FormData): Promise<ActionResult<Appointment>> {
  const recurring = formData.get('recurring') === 'on';

  if (recurring) {
    const recurrenceUntil = String(formData.get('recurrenceUntil') ?? '');
    const result = await runAction(() =>
      callBackend<Appointment[]>('/api/v1/appointments/series', {
        method: 'POST',
        body: {
          patientId: String(formData.get('patientId') ?? ''),
          locationId: String(formData.get('locationId') ?? ''),
          practitionerId: String(formData.get('practitionerId') ?? ''),
          appointmentType: String(formData.get('appointmentType') ?? ''),
          scheduledStart: new Date(String(formData.get('scheduledStart') ?? '')).toISOString(),
          scheduledEnd: new Date(String(formData.get('scheduledEnd') ?? '')).toISOString(),
          resourceIds: parseResourceIds(formData),
          override: formData.get('override') === 'on',
          visitType: formData.get('telehealth') === 'on' ? 'telehealth' : 'in_person',
          recurrence: {
            frequency: String(formData.get('recurrenceFrequency') ?? 'weekly'),
            count: Number(formData.get('recurrenceCount') ?? 2),
            ...(recurrenceUntil ? { until: recurrenceUntil } : {}),
          },
        },
      }),
    );
    if (result.ok) {
      revalidatePath('/schedule');
      return { ok: true, data: result.data[0]! };
    }
    return result;
  }

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
        resourceIds: parseResourceIds(formData),
        override: formData.get('override') === 'on',
        visitType: formData.get('telehealth') === 'on' ? 'telehealth' : 'in_person',
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

export async function rescheduleAppointment(id: string, scheduledStart: string, scheduledEnd: string): Promise<ActionResult<Appointment>> {
  const result = await runAction(() =>
    callBackend<Appointment>(`/api/v1/appointments/${id}/reschedule`, {
      method: 'POST',
      body: { scheduledStart: new Date(scheduledStart).toISOString(), scheduledEnd: new Date(scheduledEnd).toISOString() },
    }),
  );
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

export async function waitlistAppointment(id: string): Promise<ActionResult<Appointment>> {
  const result = await runAction(() => callBackend<Appointment>(`/api/v1/appointments/${id}/waitlist`, { method: 'POST' }));
  if (result.ok) revalidatePath('/schedule');
  return result;
}

export async function promoteAppointment(id: string): Promise<ActionResult<Appointment>> {
  const result = await runAction(() => callBackend<Appointment>(`/api/v1/appointments/${id}/promote`, { method: 'POST' }));
  if (result.ok) revalidatePath('/schedule');
  return result;
}
