'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { launchSmartApp } from '@/lib/actions/smart-launch';
import type { LaunchableSmartClient } from '@/lib/types';

/** Item 24 — one button per EHR-launchable app registered for this tenant. Nothing renders when
 * none are registered (the common case today, since no admin UI to register one exists yet) —
 * this is additive chart-header real estate, not something every tenant needs to see. */
export function LaunchAppMenu({ patientId, apps }: { patientId: string; apps: LaunchableSmartClient[] }) {
  const [isPending, startTransition] = useTransition();

  if (apps.length === 0) return null;

  function onLaunch(clientId: string) {
    startTransition(async () => {
      const result = await launchSmartApp(patientId, clientId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      window.location.href = result.data.launchUrl;
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Launch app:</span>
      {apps.map((app) => (
        <Button key={app.id} size="sm" variant="outline" disabled={isPending} onClick={() => onLaunch(app.clientId)}>
          {app.displayName}
        </Button>
      ))}
    </div>
  );
}
