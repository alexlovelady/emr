'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { acceptAiGeneration, rejectAiGeneration } from '@/lib/actions/ai-generations';
import type { AiGeneration } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'outline' | 'success' | 'destructive'> = {
  pending: 'outline',
  accepted: 'success',
  accepted_with_edits: 'success',
  rejected: 'destructive',
};

/**
 * Generic review UI for any of the 8 domains/ai propose endpoints — NoopAiGateway always returns a
 * single plain outputText string (never a per-feature structured object), so one editable-textarea
 * review flow covers all of them. Accepting never mutates another domain (see docs/adr/0004) — the
 * optional onAccept callback lets the caller copy the (possibly edited) text into its own existing
 * create/reply form state, which is just client-side prefill, not a write.
 */
export function AiGenerationReview({
  generation,
  onAccept,
  onReset,
}: {
  generation: AiGeneration;
  onAccept?: ((text: string) => void) | undefined;
  onReset: () => void;
}) {
  const { has } = usePermissions();
  const canReview = has(PERMISSION_KEYS.AI_GENERATION_MANAGE);
  const [text, setText] = useState(generation.editedOutputText ?? generation.outputText);
  const [status, setStatus] = useState(generation.status);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const resolved = status !== 'pending';

  async function onAcceptClick() {
    setPending(true);
    setError(null);
    const edited = text !== generation.outputText ? text : undefined;
    const result = await acceptAiGeneration(generation.id, edited);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus(result.data.status);
    onAccept?.(text);
  }

  async function onRejectClick() {
    setPending(true);
    setError(null);
    const result = await rejectAiGeneration(generation.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus(result.data.status);
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">AI draft — review before use</span>
        <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{status.replace(/_/g, ' ')}</Badge>
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} disabled={resolved} className="text-sm" />
      <p className="text-xs text-muted-foreground">
        Grounded on: {generation.provenance.source_refs.join(', ') || '(none)'} · generated{' '}
        {new Date(generation.provenance.generated_at).toLocaleString()}
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      {!resolved && !canReview && <p className="text-xs text-muted-foreground">You don&apos;t have permission to accept or reject AI drafts.</p>}
      {!resolved && canReview ? (
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={onAcceptClick}>
            {pending ? 'Saving…' : 'Accept'}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onRejectClick}>
            Reject
          </Button>
        </div>
      ) : resolved ? (
        <Button type="button" size="sm" variant="ghost" onClick={onReset}>
          Draft again
        </Button>
      ) : null}
    </div>
  );
}
