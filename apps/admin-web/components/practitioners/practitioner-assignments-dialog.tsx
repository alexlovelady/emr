'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { revokePractitionerLocationRole } from '@/lib/actions/practitioner-roles';
import type { LocationRow, PractitionerRoleRow, PractitionerRow, RoleRow } from '@/lib/types';

export function PractitionerAssignmentsDialog({
  practitioner,
  assignments,
  locations,
  roles,
}: {
  practitioner: PractitionerRow;
  assignments: PractitionerRoleRow[];
  locations: LocationRow[];
  roles: RoleRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? id;
  const roleName = (id: string) => roles.find((r) => r.id === id)?.displayName ?? id;

  function onRevoke(id: string) {
    startTransition(async () => {
      const result = await revokePractitionerLocationRole(practitioner.id, id);
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Assignments ({assignments.filter((a) => a.status === 'active').length})
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{practitioner.displayName}&rsquo;s location assignments</DialogTitle>
        </DialogHeader>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No location assignments yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{locationName(a.locationId)}</div>
                  <div className="text-xs text-muted-foreground">{roleName(a.roleId)}</div>
                </div>
                <Badge variant={a.status === 'active' ? 'success' : 'outline'}>{a.status}</Badge>
                {a.status === 'active' && (
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onRevoke(a.id)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
