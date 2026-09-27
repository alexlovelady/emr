'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { updatePractitioner, deactivatePractitioner } from '@/lib/actions/practitioners';
import { assignPractitionerLocationRole } from '@/lib/actions/practitioner-roles';
import type { LocationRow, PractitionerRow, RoleRow } from '@/lib/types';

function EditPractitionerDialog({ practitioner }: { practitioner: PractitionerRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(practitioner.displayName);
  const [npi, setNpi] = useState(practitioner.npi ?? '');
  const [taxonomyCode, setTaxonomyCode] = useState(practitioner.taxonomyCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await updatePractitioner(practitioner.id, { displayName, npi, taxonomyCode });
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
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit practitioner</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="editDisplayName">Display name</Label>
            <Input id="editDisplayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="editNpi">NPI</Label>
              <Input id="editNpi" value={npi} onChange={(e) => setNpi(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editTaxonomyCode">Taxonomy code</Label>
              <Input id="editTaxonomyCode" value={taxonomyCode} onChange={(e) => setTaxonomyCode(e.target.value)} />
            </div>
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignLocationDialog({
  practitioner,
  locations,
  roles,
}: {
  practitioner: PractitionerRow;
  locations: LocationRow[];
  roles: RoleRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [roleId, setRoleId] = useState(roles[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!locationId || !roleId) {
      setError('Choose a location and a role.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await assignPractitionerLocationRole(practitioner.id, locationId, roleId);
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
        <Button size="sm" variant="outline" disabled={locations.length === 0}>
          Assign location
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign {practitioner.displayName} to a location</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger><SelectValue placeholder="Choose a location" /></SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Role at this location</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger><SelectValue placeholder="Choose a role" /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Assigning…' : 'Assign'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PractitionerRowActions({
  practitioner,
  locations,
  roles,
}: {
  practitioner: PractitionerRow;
  locations: LocationRow[];
  roles: RoleRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onDeactivate() {
    startTransition(async () => {
      const result = await deactivatePractitioner(practitioner.id);
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-2">
      <AssignLocationDialog practitioner={practitioner} locations={locations} roles={roles} />
      <EditPractitionerDialog practitioner={practitioner} />
      {practitioner.status === 'active' && (
        <Button size="sm" variant="ghost" disabled={isPending} onClick={onDeactivate}>
          Deactivate
        </Button>
      )}
    </div>
  );
}
