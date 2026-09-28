'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { PaymentMethodFields } from '@/components/chart/payment-method-fields';
import { recordPayment } from '@/lib/actions/payments';
import type { PaymentMethod } from '@/lib/types';

export function RecordPaymentDialog({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMethodToken, setPaymentMethodToken] = useState('');
  const [bankAccountToken, setBankAccountToken] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setMethod('cash');
    setAmount('');
    setDescription('');
    setPaymentMethodToken('');
    setBankAccountToken('');
    setReferenceNumber('');
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = Math.round(Number(amount) * 100);
    if (!amountCents || amountCents <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await recordPayment(patientId, {
      method,
      amountCents,
      description: description.trim() || undefined,
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
          <Plus className="mr-1.5 h-4 w-4" /> Record payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount (USD)</Label>
            <Input id="amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
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
          <div className="space-y-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Front desk copay" />
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Recording…' : 'Record payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
