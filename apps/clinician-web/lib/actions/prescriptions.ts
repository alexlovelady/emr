'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Prescription, PrescriptionCreateResult } from '@/lib/types';

export async function createPrescription(
  patientId: string,
  _prevState: ActionResult<PrescriptionCreateResult> | null,
  formData: FormData,
): Promise<ActionResult<PrescriptionCreateResult>> {
  const isControlledSubstance = formData.get('isControlledSubstance') === 'on';
  const deaSchedule = String(formData.get('deaSchedule') ?? '');
  const dose = String(formData.get('dose') ?? '');
  const route = String(formData.get('route') ?? '');
  const frequency = String(formData.get('frequency') ?? '');
  const daysSupply = String(formData.get('daysSupply') ?? '');
  const encounterId = String(formData.get('encounterId') ?? '');
  const rxnormCode = String(formData.get('rxnormCode') ?? '');

  const body = {
    prescriberId: String(formData.get('prescriberId') ?? ''),
    medicationName: String(formData.get('medicationName') ?? ''),
    quantity: String(formData.get('quantity') ?? ''),
    refillsAuthorized: Number(formData.get('refillsAuthorized') ?? 0),
    directions: String(formData.get('directions') ?? ''),
    pharmacyNcpdpId: String(formData.get('pharmacyNcpdpId') ?? ''),
    pharmacyName: String(formData.get('pharmacyName') ?? ''),
    isControlledSubstance,
    ...(encounterId ? { encounterId } : {}),
    ...(rxnormCode ? { rxnormCode } : {}),
    ...(dose ? { dose } : {}),
    ...(route ? { route } : {}),
    ...(frequency ? { frequency } : {}),
    ...(daysSupply ? { daysSupply: Number(daysSupply) } : {}),
    ...(isControlledSubstance && deaSchedule ? { deaSchedule } : {}),
  };

  const path = isControlledSubstance
    ? `/api/v1/patients/${patientId}/prescriptions/controlled`
    : `/api/v1/patients/${patientId}/prescriptions`;

  const result = await runAction(() => callBackend<PrescriptionCreateResult>(path, { method: 'POST', body }));
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export async function cancelPrescription(id: string, patientId: string): Promise<ActionResult<Prescription>> {
  const result = await runAction(() => callBackend<Prescription>(`/api/v1/prescriptions/${id}/cancel`, { method: 'POST' }));
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export async function requestRefill(id: string, patientId: string): Promise<ActionResult<Prescription>> {
  const result = await runAction(() => callBackend<Prescription>(`/api/v1/prescriptions/${id}/refill-requests`, { method: 'POST' }));
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export async function approveRefill(id: string, patientId: string): Promise<ActionResult<unknown>> {
  const result = await runAction(() => callBackend(`/api/v1/prescription-refill-requests/${id}/approve`, { method: 'POST' }));
  if (result.ok) {
    revalidatePath(`/patients/${patientId}`);
    revalidatePath('/refill-requests');
  }
  return result;
}

export async function denyRefill(id: string, patientId: string, denialReason: string): Promise<ActionResult<unknown>> {
  const result = await runAction(() =>
    callBackend(`/api/v1/prescription-refill-requests/${id}/deny`, { method: 'POST', body: { denialReason } }),
  );
  if (result.ok) {
    revalidatePath(`/patients/${patientId}`);
    revalidatePath('/refill-requests');
  }
  return result;
}
