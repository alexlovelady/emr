'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { updateSmartClient, deactivateSmartClient, activateSmartClient } from '@/lib/actions/smart-clients';
import type { SmartClientRow } from '@/lib/types';

export function SmartClientRowActions({ client }: { client: SmartClientRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(client.displayName);
  const [description, setDescription] = useState(client.description ?? '');
  const [developerName, setDeveloperName] = useState(client.developerName ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(client.websiteUrl ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await updateSmartClient(client.id, { displayName, description, developerName, websiteUrl });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  function onToggleStatus() {
    startTransition(async () => {
      const result = client.status === 'active' ? await deactivateSmartClient(client.id) : await activateSmartClient(client.id);
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
            <DialogTitle>Edit {client.displayName}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="editScDisplayName">App name</Label>
              <Input id="editScDisplayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editScDescription">Description</Label>
              <Textarea id="editScDescription" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editScDeveloperName">Developer</Label>
              <Input id="editScDeveloperName" value={developerName} onChange={(e) => setDeveloperName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editScWebsiteUrl">Website</Label>
              <Input id="editScWebsiteUrl" type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://" />
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
      <Button size="sm" variant="ghost" disabled={isPending} onClick={onToggleStatus}>
        {client.status === 'active' ? 'Deactivate' : 'Activate'}
      </Button>
    </div>
  );
}
