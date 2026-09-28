'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { createPaymentPlan } from '@/lib/actions/payment-plans';

export function NewPaymentPlanDialog({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [totalAmount, setTotalAmount] = useState('');
  const [installmentCount, setInstallmentCount] = useState('3');
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('monthly');
  const [startDate, setStartDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setTotalAmount('');
    setInstallmentCount('3');
    setFrequency('monthly');
    setStartDate('');
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const totalAmountCents = Math.round(Number(totalAmount) * 100);
    const count = Number(installmentCount);
    if (!totalAmountCents || totalAmountCents <= 0 || !count || count < 2 || !startDate) {
      setError('Enter a valid total, at least 2 installments, and a start date.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createPaymentPlan(patientId, { totalAmountCents, installmentCount: count, frequency, startDate });
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
          <Plus className="mr-1.5 h-4 w-4" /> New payment plan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New payment plan</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="totalAmount">Total amount (USD)</Label>
            <Input id="totalAmount" type="number" min="0.01" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="installmentCount">Number of installments</Label>
            <Input
              id="installmentCount"
              type="number"
              min="2"
              max="60"
              value={installmentCount}
              onChange={(e) => setInstallmentCount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="frequency">Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
              <SelectTrigger id="frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Biweekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="startDate">First installment due</Label>
            <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <p className="text-xs text-muted-foreground">
            No automated billing exists — each installment is only marked paid when a staff member (or, in a
            later phase, the patient) explicitly pays it down here.
          </p>
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
