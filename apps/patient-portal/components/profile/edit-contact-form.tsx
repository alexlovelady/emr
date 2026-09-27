'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { updateContactInfo } from '@/lib/actions/profile';
import type { Patient } from '@/lib/types';

export function EditContactForm({ patient }: { patient: Patient }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(patient.phone ?? '');
  const [email, setEmail] = useState(patient.email ?? '');
  const [addressLine1, setAddressLine1] = useState(patient.addressLine1 ?? '');
  const [city, setCity] = useState(patient.city ?? '');
  const [state, setState] = useState(patient.state ?? '');
  const [postalCode, setPostalCode] = useState(patient.postalCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!editing) {
    return (
      <div className="space-y-2 text-sm">
        <div><span className="font-medium">Phone:</span> {patient.phone ?? '—'}</div>
        <div><span className="font-medium">Email:</span> {patient.email ?? '—'}</div>
        <div>
          <span className="font-medium">Address:</span>{' '}
          {patient.addressLine1 ? `${patient.addressLine1}, ${patient.city ?? ''} ${patient.state ?? ''} ${patient.postalCode ?? ''}` : '—'}
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit contact info
        </Button>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await updateContactInfo(patient.id, { phone, email, addressLine1, city, state, postalCode });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="addressLine1">Address</Label>
        <Input id="addressLine1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="city">City</Label>
          <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state">State</Label>
          <Input id="state" value={state} onChange={(e) => setState(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="postalCode">ZIP</Label>
          <Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </div>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
