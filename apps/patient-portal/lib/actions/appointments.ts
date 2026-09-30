'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Appointment } from '@/lib/types';

export interface BookAppointmentInput {
  locationId: string;
  practitionerId: string;
  appointmentType: string;
  scheduledStart: string;
  scheduledEnd: string;
}

export async function bookAppointment(patientId: string, input: BookAppointmentInput): Promise<ActionResult<Appointment>> {
  const result = await runAction(() =>
    callBackend<Appointment>(`/api/v1/portal/patients/${patientId}/appointments`, { method: 'POST', body: input }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}/appointments`);
  return result;
}

export async function cancelAppointment(patientId: string, appointmentId: string, reason: string): Promise<ActionResult<Appointment>> {
  const result = await runAction(() =>
    callBackend<Appointment>(`/api/v1/portal/patients/${patientId}/appointments/${appointmentId}/cancel`, {
      method: 'POST',
      body: { reason },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}/appointments`);
  return result;
}

/** Epic-parity item 3 — pre-visit agenda capture; patient-only write, staff-visible read-only. */
export async function updateAppointmentAgenda(patientId: string, appointmentId: string, agenda: string): Promise<ActionResult<Appointment>> {
  const result = await runAction(() =>
    callBackend<Appointment>(`/api/v1/portal/patients/${patientId}/appointments/${appointmentId}/agenda`, {
      method: 'POST',
      body: { agenda },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}/appointments`);
  return result;
}
