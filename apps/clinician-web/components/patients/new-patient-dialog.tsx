'use client';

import { useActionState, useState } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { createPatient } from '@/lib/actions/patients';
import { useCloseOnSuccess } from '@/lib/use-close-on-success';
import { useDuplicateCheck } from './use-duplicate-check';

export function NewPatientDialog() {
  const [open, setOpen] = useState(false);
  const [givenName, setGivenName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [state, formAction, isPending] = useActionState(createPatient, null);
  const duplicates = useDuplicateCheck({ givenName, familyName, dateOfBirth });

  useCloseOnSuccess(state, () => {
    setOpen(false);
    setGivenName('');
    setFamilyName('');
    setDateOfBirth('');
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New patient
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register patient</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="givenName">First name</Label>
              <Input id="givenName" name="givenName" value={givenName} onChange={(e) => setGivenName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="familyName">Last name</Label>
              <Input id="familyName" name="familyName" value={familyName} onChange={(e) => setFamilyName(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dateOfBirth">Date of birth</Label>
            <Input id="dateOfBirth" name="dateOfBirth" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required />
          </div>

          {duplicates.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Possible existing patient{duplicates.length > 1 ? 's' : ''}:</p>
                <ul className="mt-1 list-inside list-disc">
                  {duplicates.slice(0, 3).map((d) => (
                    <li key={d.id}>
                      {d.familyName}, {d.givenName} — DOB {d.dateOfBirth} (match score {d.score})
                    </li>
                  ))}
                </ul>
              </div>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" name="phone" type="tel" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email (optional)</Label>
              <Input id="email" name="email" type="email" />
            </div>
          </div>

          {state && !state.ok && <Alert variant="destructive">{state.error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Registering…' : 'Register patient'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
