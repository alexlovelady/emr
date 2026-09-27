'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { payBalance } from '@/lib/actions/payments';

export function PayBalanceForm({ patientId, balance }: { patientId: string; balance: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState(Math.max(0, Number(balance)).toFixed(2));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setPending(true);
    setError(null);
    setResult(null);
    const res = await payBalance(patientId, cents);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res.data.status === 'succeeded' ? 'Payment succeeded.' : `Payment failed: ${res.data.failureReason ?? 'unknown reason'}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-dashed border-border p-4">
      <p className="text-xs text-muted-foreground">
        Payments are processed through a test payment gateway in this environment — no real card is
        charged.
      </p>
      <div className="flex items-end gap-2">
        <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32" />
        <Button type="submit" disabled={pending}>
          {pending ? 'Processing…' : 'Pay'}
        </Button>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {result && <p className="text-sm">{result}</p>}
    </form>
  );
}
