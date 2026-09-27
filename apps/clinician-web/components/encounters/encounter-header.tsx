'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { documentEncounter, sendEncounterToCoding, signEncounter, startEncounter } from '@/lib/actions/encounters';
import type { Encounter, Patient } from '@/lib/types';

const STATUS_LABEL: Record<Encounter['status'], string> = {
  roomed: 'Roomed',
  in_progress: 'In progress',
  documentation: 'Documentation',
  signed: 'Signed',
  coding_review: 'Coding review',
};

export function EncounterHeader({ encounter, patient }: { encounter: Encounter; patient: Patient }) {
  const { has } = usePermissions();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error);
    });
  }

  const canCreate = has(PERMISSION_KEYS.ENCOUNTER_CREATE);
  const canSign = has(PERMISSION_KEYS.ENCOUNTER_SIGN);

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <Link href={`/patients/${patient.id}`} className="text-sm text-primary hover:underline">
          {patient.familyName}, {patient.givenName}
        </Link>
        <div className="mt-0.5 flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{encounter.encounterType.replace(/_/g, ' ')}</h1>
          <Badge variant={encounter.status === 'signed' ? 'success' : 'outline'}>{STATUS_LABEL[encounter.status]}</Badge>
        </div>
        {encounter.chiefComplaint && <p className="mt-1 text-sm text-muted-foreground">{encounter.chiefComplaint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {encounter.status === 'roomed' && canCreate && (
          <Button size="sm" disabled={isPending} onClick={() => run(() => startEncounter(encounter.id))}>
            Start visit
          </Button>
        )}
        {encounter.status === 'in_progress' && canCreate && (
          <Button size="sm" disabled={isPending} onClick={() => run(() => documentEncounter(encounter.id))}>
            Move to documentation
          </Button>
        )}
        {encounter.status === 'documentation' && canSign && (
          <Button size="sm" disabled={isPending} onClick={() => run(() => signEncounter(encounter.id))}>
            Sign encounter
          </Button>
        )}
        {encounter.status === 'signed' && canCreate && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => sendEncounterToCoding(encounter.id))}>
            Send to coding
          </Button>
        )}
      </div>
    </div>
  );
}
