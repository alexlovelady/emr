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
import { createResource } from '@/lib/actions/resources';
import type { LocationRow } from '@/lib/types';

export function NewResourceDialog({ locations }: { locations: LocationRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [name, setName] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!locationId) {
      setError('Choose a location first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createResource(locationId, name, resourceType);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setName('');
    setResourceType('');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={locations.length === 0}>
          <Plus className="mr-1.5 h-4 w-4" /> New resource
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New resource</DialogTitle>
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
            <Label htmlFor="resourceName">Name</Label>
            <Input id="resourceName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Exam Room 3" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resourceType">Type</Label>
            <Input id="resourceType" value={resourceType} onChange={(e) => setResourceType(e.target.value)} placeholder="room" required />
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create resource'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
