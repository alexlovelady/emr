'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { AiProposeTrigger } from '@/components/ai/ai-propose-trigger';
import { DecideAppealDialog } from '@/components/chart/decide-appeal-dialog';
import { proposeAppealDraft } from '@/lib/actions/ai-generations';
import { createAppeal, submitAppeal } from '@/lib/actions/appeals';
import type { Appeal, Denial } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'outline' | 'success' | 'destructive'> = {
  draft: 'outline',
  submitted: 'outline',
  won: 'success',
  lost: 'destructive',
  withdrawn: 'destructive',
};

/** Shown inline under an open denial in the Billing tab — drafting/creating/submitting/deciding an
 * appeal, all scoped to this one denial. `appeals` is already filtered to this denial's own. */
export function AppealPanel({ patientId, denial, appeals }: { patientId: string; denial: Denial; appeals: Appeal[] }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [aiGenerationId, setAiGenerationId] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasActiveAppeal = appeals.some((a) => a.status === 'draft' || a.status === 'submitted');

  async function onCreate() {
    if (!reason.trim()) return;
    setCreating(true);
    setError(null);
    const result = await createAppeal(denial.id, patientId, reason.trim(), aiGenerationId);
    setCreating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setReason('');
    setAiGenerationId(undefined);
    router.refresh();
  }

  function onSubmitAppeal(appealId: string) {
    startTransition(async () => {
      const result = await submitAppeal(appealId, patientId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
      {appeals.length > 0 && (
        <ul className="space-y-2">
          {appeals.map((a) => (
            <li key={a.id} className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[a.status] ?? 'outline'}>{a.status}</Badge>
                <span className="flex-1 text-muted-foreground">
                  {a.submittedAt ? `Submitted ${new Date(a.submittedAt).toLocaleDateString()}` : 'Not yet submitted'}
                </span>
                {a.status === 'draft' && (
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => onSubmitAppeal(a.id)}>
                    Submit
                  </Button>
                )}
                {a.status === 'submitted' && <DecideAppealDialog appealId={a.id} patientId={patientId} />}
              </div>
              <p className="whitespace-pre-wrap text-muted-foreground">{a.appealReason}</p>
              {a.decisionNotes && <p className="italic text-muted-foreground">Decision: {a.decisionNotes}</p>}
            </li>
          ))}
        </ul>
      )}

      {!hasActiveAppeal && denial.status === 'open' && (
        <div className="space-y-2">
          <AiProposeTrigger
            label="Draft appeal with AI"
            proposeFn={() => proposeAppealDraft(denial.id)}
            onAccept={(text, generationId) => {
              setReason(text);
              setAiGenerationId(generationId);
            }}
          />
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Appeal argument…"
            className="text-sm"
          />
          {error && <Alert variant="destructive">{error}</Alert>}
          <Button size="sm" disabled={creating || !reason.trim()} onClick={onCreate}>
            {creating ? 'Creating…' : 'Create appeal'}
          </Button>
        </div>
      )}
    </div>
  );
}
