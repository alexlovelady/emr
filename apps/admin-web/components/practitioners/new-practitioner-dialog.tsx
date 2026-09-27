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
import { createPractitioner } from '@/lib/actions/practitioners';
import type { OrganizationRow, UserRow } from '@/lib/types';

export function NewPractitionerDialog({ users, organizations }: { users: UserRow[]; organizations: OrganizationRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(users[0]?.id ?? '');
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? '');
  const [displayName, setDisplayName] = useState('');
  const [npi, setNpi] = useState('');
  const [taxonomyCode, setTaxonomyCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !organizationId) {
      setError('Choose a user and an organization first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createPractitioner({ userId, organizationId, displayName, npi, taxonomyCode });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setDisplayName('');
    setNpi('');
    setTaxonomyCode('');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={users.length === 0 || organizations.length === 0}>
          <Plus className="mr-1.5 h-4 w-4" /> New practitioner
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New practitioner</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>User account</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Choose a user" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="npi">NPI (optional)</Label>
              <Input id="npi" value={npi} onChange={(e) => setNpi(e.target.value)} placeholder="10-digit NPI" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="taxonomyCode">Taxonomy code (optional)</Label>
              <Input id="taxonomyCode" value={taxonomyCode} onChange={(e) => setTaxonomyCode(e.target.value)} />
            </div>
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create practitioner'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
