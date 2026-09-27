'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { PortalPaymentResult } from '@/lib/types';

export async function payBalance(patientId: string, amountCents: number): Promise<ActionResult<PortalPaymentResult>> {
  const result = await runAction(() =>
    callBackend<PortalPaymentResult>(`/api/v1/portal/patients/${patientId}/payments`, {
      method: 'POST',
      body: { amountCents, currency: 'usd', paymentMethodToken: 'tok_portal_demo' },
    }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}/billing`);
  return result;
}
