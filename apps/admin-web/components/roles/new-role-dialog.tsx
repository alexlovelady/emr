'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { createRole } from '@/lib/actions/roles';

export function NewRoleDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createRole(key, displayName);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setKey('');
    setDisplayName('');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>A new role starts with no permissions — grant them below after creating it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="roleKey">Key</Label>
            <Input
              id="roleKey"
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder="billing_coordinator"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="roleDisplayName">Display name</Label>
            <Input id="roleDisplayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Billing Coordinator" required />
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
