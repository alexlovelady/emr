'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { amendNote, signNote, submitNoteForReview, updateNoteContent, voidNote } from '@/lib/actions/notes';
import { proposeNoteDraft } from '@/lib/actions/ai-generations';
import { AiProposeTrigger } from '@/components/ai/ai-propose-trigger';
import { AmbientAudioNoteDraft } from '@/components/encounters/ambient-audio-note-draft';
import type { Note } from '@/lib/types';

const EDITABLE_STATUSES: Note['status'][] = ['draft', 'ready_for_review'];

export function NoteEditor({ note, encounterId }: { note: Note; encounterId: string }) {
  const router = useRouter();
  const { has } = usePermissions();
  const [content, setContent] = useState(note.content);
  const [isPending, startTransition] = useTransition();

  const editable = EDITABLE_STATUSES.includes(note.status) && has(PERMISSION_KEYS.NOTE_CREATE);
  const dirty = JSON.stringify(content) !== JSON.stringify(note.content);

  function applyDraft(text: string) {
    const firstSection = Object.keys(content)[0];
    if (firstSection) setContent((c) => ({ ...c, [firstSection]: text }));
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant={note.status === 'signed' ? 'success' : note.status === 'voided' ? 'destructive' : 'outline'}>
          {note.status.replace(/_/g, ' ')}
        </Badge>
        {note.amendsNoteId && <span className="text-xs text-muted-foreground">Amends a prior signed note</span>}
      </div>

      {editable && note.status === 'draft' && (
        <div className="space-y-2">
          <AiProposeTrigger label="Draft with AI" proposeFn={() => proposeNoteDraft(encounterId)} onAccept={applyDraft} />
          <AmbientAudioNoteDraft encounterId={encounterId} onAccept={applyDraft} />
        </div>
      )}

      {Object.entries(content).map(([section, text]) => (
        <div key={section} className="space-y-1.5">
          <Label>{section}</Label>
          {editable ? (
            <Textarea
              value={text}
              onChange={(e) => setContent((c) => ({ ...c, [section]: e.target.value }))}
              rows={4}
            />
          ) : (
            <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-3 text-sm">{text || '—'}</p>
          )}
        </div>
      ))}

      {note.status === 'voided' && note.voidReason && (
        <p className="text-sm text-muted-foreground">Void reason: {note.voidReason}</p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {editable && (
          <Button size="sm" variant="outline" disabled={isPending || !dirty} onClick={() => run(() => updateNoteContent(note.id, encounterId, content))}>
            Save draft
          </Button>
        )}
        {note.status === 'draft' && has(PERMISSION_KEYS.NOTE_CREATE) && (
          <Button size="sm" disabled={isPending} onClick={() => run(() => submitNoteForReview(note.id, encounterId))}>
            Submit for review
          </Button>
        )}
        {note.status === 'ready_for_review' && has(PERMISSION_KEYS.NOTE_SIGN) && (
          <Button size="sm" disabled={isPending} onClick={() => run(() => signNote(note.id, encounterId))}>
            Sign note
          </Button>
        )}
        {EDITABLE_STATUSES.includes(note.status) && has(PERMISSION_KEYS.NOTE_CREATE) && (
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => {
              const reason = window.prompt('Reason for voiding this note:');
              if (reason) run(() => voidNote(note.id, encounterId, reason));
            }}
          >
            Void
          </Button>
        )}
        {note.status === 'signed' && has(PERMISSION_KEYS.NOTE_CREATE) && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => amendNote(note.id, encounterId))}>
            Amend
          </Button>
        )}
      </div>
    </div>
  );
}
