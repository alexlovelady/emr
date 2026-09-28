'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { PaymentMethodFields } from '@/components/chart/payment-method-fields';
import { payInstallment } from '@/lib/actions/payment-plans';
import type { PaymentMethod, PaymentPlanInstallment } from '@/lib/types';

export function PayInstallmentDialog({
  planId,
  installment,
  patientId,
}: {
  planId: string;
  installment: PaymentPlanInstallment;
  patientId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paymentMethodToken, setPaymentMethodToken] = useState('');
  const [bankAccountToken, setBankAccountToken] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setMethod('cash');
    setPaymentMethodToken('');
    setBankAccountToken('');
    setReferenceNumber('');
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await payInstallment(planId, installment.id, patientId, {
      method,
      ...(method === 'card' ? { paymentMethodToken } : {}),
      ...(method === 'ach' ? { bankAccountToken } : {}),
      ...(method === 'check' ? { referenceNumber } : {}),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Pay ${installment.amount}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Pay installment {installment.sequenceNumber} — ${installment.amount}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <PaymentMethodFields
            method={method}
            onMethodChange={setMethod}
            paymentMethodToken={paymentMethodToken}
            onPaymentMethodTokenChange={setPaymentMethodToken}
            bankAccountToken={bankAccountToken}
            onBankAccountTokenChange={setBankAccountToken}
            referenceNumber={referenceNumber}
            onReferenceNumberChange={setReferenceNumber}
          />
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Paying…' : 'Pay'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
