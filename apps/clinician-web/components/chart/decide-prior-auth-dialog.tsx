'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { recordPriorAuthDecision } from '@/lib/actions/prior-authorizations';

export function DecidePriorAuthDialog({ priorAuthId, patientId }: { priorAuthId: string; patientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<'approved' | 'denied'>('approved');
  const [payerReferenceNumber, setPayerReferenceNumber] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [denialReason, setDenialReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await recordPriorAuthDecision(priorAuthId, patientId, {
      decision,
      payerReferenceNumber,
      validFrom,
      validUntil,
      denialReason,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Record decision
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record prior authorization decision</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="decision">Decision</Label>
            <Select value={decision} onValueChange={(v) => setDecision(v as 'approved' | 'denied')}>
              <SelectTrigger id="decision">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {decision === 'approved' ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="payerReferenceNumber">Payer reference number (optional)</Label>
                <Input id="payerReferenceNumber" value={payerReferenceNumber} onChange={(e) => setPayerReferenceNumber(e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="validFrom">Valid from (optional)</Label>
                  <Input id="validFrom" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="validUntil">Valid until</Label>
                  <Input id="validUntil" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} required />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">An approval requires a valid-until date.</p>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="denialReason">Denial reason</Label>
              <Textarea id="denialReason" value={denialReason} onChange={(e) => setDenialReason(e.target.value)} rows={3} required />
            </div>
          )}
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Record decision'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
