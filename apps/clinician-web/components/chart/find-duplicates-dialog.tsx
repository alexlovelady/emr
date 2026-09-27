'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { mergePatient } from '@/lib/actions/patients';
import type { DuplicateCandidate, Patient } from '@/lib/types';

export function FindDuplicatesDialog({ patient }: { patient: Patient }) {
  const { has } = usePermissions();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<DuplicateCandidate[] | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!has(PERMISSION_KEYS.PATIENT_MERGE)) return null;

  async function onOpen(next: boolean) {
    setOpen(next);
    if (!next) return;
    setCandidates(null);
    const query = new URLSearchParams({
      givenName: patient.givenName,
      familyName: patient.familyName,
      dateOfBirth: patient.dateOfBirth,
    });
    const res = await fetch(`/api/backend/patients/duplicates?${query.toString()}`);
    const all: DuplicateCandidate[] = res.ok ? await res.json() : [];
    setCandidates(all.filter((c) => c.id !== patient.id));
  }

  function onMerge(sourcePatientId: string) {
    startTransition(async () => {
      const result = await mergePatient(sourcePatientId, patient.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Patients merged');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <Button size="sm" variant="outline" onClick={() => onOpen(true)}>
        <Search className="mr-1.5 h-4 w-4" /> Find duplicates
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Possible duplicate patients</DialogTitle>
        </DialogHeader>
        {candidates === null ? (
          <p className="text-sm text-muted-foreground">Searching…</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No possible duplicates found.</p>
        ) : (
          <ul className="divide-y divide-border">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  {c.familyName}, {c.givenName} — DOB {c.dateOfBirth} (score {c.score})
                </span>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => onMerge(c.id)}>
                  Merge into this patient
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
