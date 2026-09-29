'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { requestExport, type ExportFormat } from '@/lib/actions/exports';
import type { ExportRequest } from '@/lib/types';

const FORMAT_LABELS: Record<ExportFormat, string> = {
  json: 'JSON (raw data)',
  pdf: 'PDF (readable summary)',
  'ccd-xml': 'C-CDA (CCD XML, for sharing with another provider)',
};

export function ExportRecordsPanel({ patientId, history }: { patientId: string; history: ExportRequest[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRequest(format: ExportFormat) {
    setPending(format);
    setError(null);
    const result = await requestExport(patientId, format);
    setPending(null);
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
        results.
      </p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map((format) => (
          <Button key={format} type="button" onClick={() => onRequest(format)} disabled={pending !== null}>
            {pending === format ? 'Preparing…' : FORMAT_LABELS[format]}
          </Button>
        ))}
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {history.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2">
              <span>{new Date(h.createdAt).toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">
                {FORMAT_LABELS[h.format as ExportFormat] ?? h.format} — {h.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
