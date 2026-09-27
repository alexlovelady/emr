'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { LocationRow } from '@/lib/types';

export interface LocationAddressInput {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
}

export async function createLocation(
  organizationId: string,
  name: string,
  timeZone: string,
  address: LocationAddressInput,
): Promise<ActionResult<LocationRow>> {
  const result = await runAction(() =>
    callBackend<LocationRow>('/api/v1/locations', {
      method: 'POST',
      body: {
        organizationId,
        name,
        timeZone: timeZone.trim() || undefined,
        addressLine1: address.addressLine1.trim() || undefined,
        addressLine2: address.addressLine2.trim() || undefined,
        city: address.city.trim() || undefined,
        state: address.state.trim() || undefined,
        postalCode: address.postalCode.trim() || undefined,
      },
    }),
  );
  if (result.ok) revalidatePath('/locations');
  return result;
}

export async function updateLocation(
  id: string,
  name: string,
  timeZone: string,
  address: LocationAddressInput,
): Promise<ActionResult<LocationRow>> {
  const result = await runAction(() =>
    callBackend<LocationRow>(`/api/v1/locations/${id}`, {
      method: 'PATCH',
      body: {
        name,
        timeZone: timeZone.trim() || undefined,
        addressLine1: address.addressLine1.trim() || null,
        addressLine2: address.addressLine2.trim() || null,
        city: address.city.trim() || null,
        state: address.state.trim() || null,
        postalCode: address.postalCode.trim() || null,
      },
    }),
  );
  if (result.ok) revalidatePath('/locations');
  return result;
}

export async function deactivateLocation(id: string): Promise<ActionResult<LocationRow>> {
  const result = await runAction(() => callBackend<LocationRow>(`/api/v1/locations/${id}/deactivate`, { method: 'POST' }));
  if (result.ok) revalidatePath('/locations');
  return result;
}
