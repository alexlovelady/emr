'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { updateOrganization, deactivateOrganization } from '@/lib/actions/organizations';
import type { OrganizationRow } from '@/lib/types';

export function OrganizationRowActions({ organization }: { organization: OrganizationRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(organization.name);
  const [npi, setNpi] = useState(organization.npi ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await updateOrganization(organization.id, name, npi);
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
      const result = await deactivateOrganization(organization.id);
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
            <DialogTitle>Edit organization</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="editOrgName">Name</Label>
              <Input id="editOrgName" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editOrgNpi">NPI (optional)</Label>
              <Input id="editOrgNpi" value={npi} onChange={(e) => setNpi(e.target.value)} />
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
      {organization.status === 'active' && (
        <Button size="sm" variant="ghost" disabled={isPending} onClick={onDeactivate}>
          Deactivate
        </Button>
      )}
    </div>
  );
}
