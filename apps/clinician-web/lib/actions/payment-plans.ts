'use server';

import { revalidatePath } from 'next/cache';
import { callBackend } from '@/lib/api-proxy';
import { runAction, type ActionResult } from './action-result';
import type { PaymentMethod, PaymentPlanWithInstallments, PaymentPlanInstallment, PaymentResult } from '@/lib/types';

export interface CreatePaymentPlanInput {
  totalAmountCents: number;
  installmentCount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  startDate: string;
}

export async function createPaymentPlan(patientId: string, input: CreatePaymentPlanInput): Promise<ActionResult<PaymentPlanWithInstallments>> {
  const result = await runAction(() =>
    callBackend<PaymentPlanWithInstallments>(`/api/v1/patients/${patientId}/payment-plans`, { method: 'POST', body: input }),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}

export interface PayInstallmentInput {
  method: PaymentMethod;
  paymentMethodToken?: string;
  bankAccountToken?: string;
  referenceNumber?: string;
}

export async function payInstallment(
  planId: string,
  installmentId: string,
  patientId: string,
  input: PayInstallmentInput,
): Promise<ActionResult<{ installment: PaymentPlanInstallment; payment: PaymentResult }>> {
  const result = await runAction(() =>
    callBackend<{ installment: PaymentPlanInstallment; payment: PaymentResult }>(
      `/api/v1/payment-plans/${planId}/installments/${installmentId}/pay`,
      { method: 'POST', body: input },
    ),
  );
  if (result.ok) revalidatePath(`/patients/${patientId}`);
  return result;
}
