'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/chart/empty-state';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import type { DocumentItem } from '@/lib/types';

function formatSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPanel({ documents, patientId }: { documents: DocumentItem[]; patientId: string }) {
  const { has } = usePermissions();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState('');
  const [uploading, setUploading] = useState(false);

  async function onUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.set('file', file);
    form.set('patientId', patientId);
    if (category) form.set('documentCategory', category);
    try {
      const res = await fetch('/api/documents', { method: 'POST', body: form });
      if (!res.ok) {
        const problem = await res.json().catch(() => undefined);
        toast.error(problem?.title ?? 'Upload failed');
        return;
      }
      toast.success('Document uploaded');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setCategory('');
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function onDownload(doc: DocumentItem) {
    const res = await fetch(`/api/documents/${doc.id}/download-url`);
    if (!res.ok) {
      toast.error('Could not get download link');
      return;
    }
    const { url } = await res.json();
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="space-y-4">
      {has(PERMISSION_KEYS.DOCUMENT_UPLOAD) && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="doc-file">File</Label>
            <input ref={fileInputRef} id="doc-file" type="file" className="block text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-category">Category (optional)</Label>
            <Input id="doc-category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="referral" className="w-40" />
          </div>
          <Button size="sm" onClick={onUpload} disabled={uploading}>
            <Upload className="mr-1.5 h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      )}
      {documents.length === 0 ? (
        <EmptyState icon={FileText} message="No documents on file." />
      ) : (
        <ul className="divide-y divide-border">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-3">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{d.filename}</div>
                <div className="text-xs text-muted-foreground">
                  {d.documentCategory ?? 'uncategorized'} · {formatSize(d.sizeBytes)} · {new Date(d.createdAt).toLocaleDateString()}
                </div>
              </div>
              {d.status === 'stored' && has(PERMISSION_KEYS.DOCUMENT_DOWNLOAD) && (
                <Button size="sm" variant="ghost" onClick={() => onDownload(d)}>
                  <Download className="mr-1.5 h-4 w-4" /> Download
                </Button>
              )}
              {d.status === 'pending_upload' && <span className="text-xs text-muted-foreground">uploading…</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
