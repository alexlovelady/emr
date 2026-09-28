'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { createReferral } from '@/lib/actions/referrals';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';

export function NewReferralDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createReferral, null);
  const [urgency, setUrgency] = useState('routine');

  useCloseOnSuccess(state, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New referral
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New referral</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="urgency" value={urgency} />
          <div className="space-y-1.5">
            <Label htmlFor="referringPractitionerId">Referring practitioner ID</Label>
            <Input id="referringPractitionerId" name="referringPractitionerId" placeholder="UUID" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="specialty">Specialty</Label>
            <Input id="specialty" name="specialty" placeholder="Cardiology" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="referredToPractitionerId">Internal practitioner ID (optional)</Label>
              <Input id="referredToPractitionerId" name="referredToPractitionerId" placeholder="UUID" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="externalProviderName">Or external provider (optional)</Label>
              <Input id="externalProviderName" name="externalProviderName" placeholder="Riverside Cardiology" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" name="reason" rows={3} required />
          </div>
          <div className="space-y-1.5">
            <Label>Urgency</Label>
            <Select value={urgency} onValueChange={setUrgency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="stat">STAT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create referral'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
