'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AddressFields } from './address-fields';
import { createLocation, type LocationAddressInput } from '@/lib/actions/locations';
import type { OrganizationRow } from '@/lib/types';

const EMPTY_ADDRESS: LocationAddressInput = { addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '' };

export function NewLocationDialog({ organizations }: { organizations: OrganizationRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? '');
  const [name, setName] = useState('');
  const [timeZone, setTimeZone] = useState('');
  const [address, setAddress] = useState<LocationAddressInput>(EMPTY_ADDRESS);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!organizationId) {
      setError('Choose an organization first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createLocation(organizationId, name, timeZone, address);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setName('');
    setTimeZone('');
    setAddress(EMPTY_ADDRESS);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={organizations.length === 0}>
          <Plus className="mr-1.5 h-4 w-4" /> New location
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New location</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Organization</Label>
            <Select value={organizationId} onValueChange={setOrganizationId}>
              <SelectTrigger><SelectValue placeholder="Choose an organization" /></SelectTrigger>
              <SelectContent>
                {organizations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locationName">Name</Label>
            <Input id="locationName" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locationTimeZone">Time zone (optional)</Label>
            <Input id="locationTimeZone" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} placeholder="America/New_York" />
          </div>
          <AddressFields value={address} onChange={(patch) => setAddress((a) => ({ ...a, ...patch }))} />
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create location'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
