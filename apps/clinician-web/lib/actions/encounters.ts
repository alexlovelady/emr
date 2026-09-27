'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Encounter } from '@/lib/types';

export async function createEncounter(appointmentId: string, encounterType: string, chiefComplaint?: string): Promise<ActionResult<Encounter>> {
  const result = await runAction(() =>
    callBackend<Encounter>('/api/v1/encounters', {
      method: 'POST',
      body: { appointmentId, encounterType, ...(chiefComplaint ? { chiefComplaint } : {}) },
    }),
  );
  if (result.ok) revalidatePath('/schedule');
  return result;
}

export async function startEncounter(id: string): Promise<ActionResult<Encounter>> {
  const result = await runAction(() => callBackend<Encounter>(`/api/v1/encounters/${id}/start`, { method: 'POST' }));
  if (result.ok) revalidatePath(`/encounters/${id}`);
  return result;
}

export async function documentEncounter(id: string): Promise<ActionResult<Encounter>> {
  const result = await runAction(() => callBackend<Encounter>(`/api/v1/encounters/${id}/document`, { method: 'POST' }));
  if (result.ok) revalidatePath(`/encounters/${id}`);
  return result;
}

export async function signEncounter(id: string): Promise<ActionResult<Encounter>> {
  const result = await runAction(() => callBackend<Encounter>(`/api/v1/encounters/${id}/sign`, { method: 'POST' }));
  if (result.ok) revalidatePath(`/encounters/${id}`);
  return result;
}

export async function sendEncounterToCoding(id: string): Promise<ActionResult<Encounter>> {
  const result = await runAction(() => callBackend<Encounter>(`/api/v1/encounters/${id}/send-to-coding`, { method: 'POST' }));
  if (result.ok) revalidatePath(`/encounters/${id}`);
  return result;
}
