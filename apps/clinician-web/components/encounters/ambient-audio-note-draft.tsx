'use client';

import { useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { AiProposeTrigger } from '@/components/ai/ai-propose-trigger';
import { proposeNoteDraft } from '@/lib/actions/ai-generations';

/**
 * The real (audio-based) ambient scribe path, alongside `note-editor.tsx`'s existing typed-
 * instructions "Draft with AI" button. Uploading always succeeds (real object storage, when
 * running) — drafting from it will honestly fail until a real speech-to-text vendor is configured,
 * since no fake transcript is ever generated. See `TranscriptionGateway`'s doc comment.
 */
export function AmbientAudioNoteDraft({ encounterId, onAccept }: { encounterId: string; onAccept: (text: string, generationId: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function onFileSelected() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setDocumentId(null);
    const form = new FormData();
    form.set('file', file);
    form.set('encounterId', encounterId);
    form.set('documentCategory', 'ambient_audio');
    try {
      const res = await fetch('/api/documents', { method: 'POST', body: form });
      if (!res.ok) {
        const problem = await res.json().catch(() => undefined);
        setUploadError(problem?.title ?? 'Upload failed');
        return;
      }
      const doc = (await res.json()) as { id: string };
      setDocumentId(doc.id);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1.5 rounded-md border border-dashed border-border p-3">
      <p className="text-xs text-muted-foreground">
        Ambient scribe (beta): upload a recording of the visit. No speech-to-text vendor is connected
        in this environment, so drafting from it will report that rather than fabricate a note.
      </p>
      <input ref={fileInputRef} type="file" accept="audio/*" onChange={onFileSelected} className="block text-sm" disabled={uploading} />
      {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
      {uploadError && <Alert variant="destructive">{uploadError}</Alert>}
      {documentId && (
        <AiProposeTrigger label="Draft from audio" proposeFn={() => proposeNoteDraft(encounterId, undefined, documentId)} onAccept={onAccept} />
      )}
    </div>
  );
}
