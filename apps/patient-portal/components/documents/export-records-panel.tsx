'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { requestExport } from '@/lib/actions/exports';
import type { ExportRequest } from '@/lib/types';

export function ExportRecordsPanel({ patientId, history }: { patientId: string; history: ExportRequest[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRequest() {
    setPending(true);
    setError(null);
    const result = await requestExport(patientId);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.open(result.data.downloadUrl, '_blank', 'noopener,noreferrer');
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Download a copy of your active problems, allergies, medications, signed visit notes, and released
        results as a JSON file.
      </p>
      <Button type="button" onClick={onRequest} disabled={pending}>
        {pending ? 'Preparing…' : 'Download my records'}
      </Button>
      {error && <Alert variant="destructive">{error}</Alert>}
      {history.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2">
              <span>{new Date(h.createdAt).toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">{h.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
