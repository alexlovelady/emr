'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AddressFields } from './address-fields';
import { updateLocation, deactivateLocation, type LocationAddressInput } from '@/lib/actions/locations';
import type { LocationRow } from '@/lib/types';

export function LocationRowActions({ location }: { location: LocationRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(location.name);
  const [timeZone, setTimeZone] = useState(location.timeZone);
  const [address, setAddress] = useState<LocationAddressInput>({
    addressLine1: location.addressLine1 ?? '',
    addressLine2: location.addressLine2 ?? '',
    city: location.city ?? '',
    state: location.state ?? '',
    postalCode: location.postalCode ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await updateLocation(location.id, name, timeZone, address);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  function onDeactivate() {
    startTransition(async () => {
      const result = await deactivateLocation(location.id);
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            Edit
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit location</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="editLocationName">Name</Label>
              <Input id="editLocationName" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editLocationTimeZone">Time zone</Label>
              <Input id="editLocationTimeZone" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} />
            </div>
            <AddressFields value={address} onChange={(patch) => setAddress((a) => ({ ...a, ...patch }))} />
            {error && <Alert variant="destructive">{error}</Alert>}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {location.status === 'active' && (
        <Button size="sm" variant="ghost" disabled={isPending} onClick={onDeactivate}>
          Deactivate
        </Button>
      )}
    </div>
  );
}
