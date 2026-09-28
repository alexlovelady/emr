'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { PaymentMethod, PaymentResult } from '@/lib/types';

export interface RecordPaymentInput {
  method: PaymentMethod;
  amountCents: number;
  paymentMethodToken?: string | undefined;
  bankAccountToken?: string | undefined;
  referenceNumber?: string | undefined;
  description?: string | undefined;
}

export async function recordPayment(patientId: string, input: RecordPaymentInput): Promise<ActionResult<PaymentResult>> {
  const result = await runAction(() =>
    callBackend<PaymentResult>(`/api/v1/patients/${patientId}/payments`, { method: 'POST', body: input }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
