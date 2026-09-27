'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { finalizeCoding } from '@/lib/actions/charges';
import type { Charge } from '@/lib/types';

export function FinalizeCodingDialog({ charge }: { charge: Charge }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(charge.code);
  const [description, setDescription] = useState(charge.description);
  const [diagnosisCodes, setDiagnosisCodes] = useState(charge.diagnosisCodes.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await finalizeCoding(charge.id, {
      code,
      description,
      diagnosisCodes: diagnosisCodes.split(',').map((c) => c.trim()).filter(Boolean),
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
        <Button size="sm">Finalize coding</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Finalize coding</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Code</Label>
            <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="diagnosisCodes">Diagnosis codes (comma-separated)</Label>
            <Input id="diagnosisCodes" value={diagnosisCodes} onChange={(e) => setDiagnosisCodes(e.target.value)} />
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save & mark coded'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
