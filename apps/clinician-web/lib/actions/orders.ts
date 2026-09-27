'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { Order } from '@/lib/types';

export async function createOrder(_prevState: ActionResult<Order> | null, formData: FormData): Promise<ActionResult<Order>> {
  const encounterId = String(formData.get('encounterId') ?? '');
  const code = String(formData.get('code') ?? '');
  const result = await runAction(() =>
    callBackend<Order>('/api/v1/orders', {
      method: 'POST',
      body: {
        encounterId,
        orderingPractitionerId: String(formData.get('orderingPractitionerId') ?? ''),
        orderType: String(formData.get('orderType') ?? ''),
        displayName: String(formData.get('displayName') ?? ''),
        priority: String(formData.get('priority') ?? 'routine'),
        ...(code ? { code } : {}),
      },
    }),
  );
  if (result.ok) revalidatePath(`/encounters/${encounterId}`);
  return result;
}

export async function cancelOrder(id: string, encounterId: string): Promise<ActionResult<Order>> {
  const result = await runAction(() => callBackend<Order>(`/api/v1/orders/${id}/cancel`, { method: 'POST' }));
  if (result.ok) revalidatePath(`/encounters/${encounterId}`);
  return result;
}
