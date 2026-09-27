'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { proposeCohortDsl, executeCohortDsl } from '@/lib/actions/ai-generations';
import type { CohortExecutionRow } from '@/lib/types';

/**
 * The NL-to-cohort-DSL feature's one real difference from the other 7 AI features: accepting it runs
 * a real (read-only) cohort query rather than just flipping a status flag (see docs/adr/0004), so this
 * calls execute-cohort directly instead of going through the generic AiGenerationReview/accept flow.
 * NoopAiGateway always returns the same canned DSL regardless of the question asked — disclosed here
 * rather than left to look broken.
 */
export function CohortDslAssistant({ onExecuted }: { onExecuted: (execution: CohortExecutionRow) => void }) {
  const { has } = usePermissions();
  const [question, setQuestion] = useState('');
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [dslText, setDslText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!has(PERMISSION_KEYS.AI_GENERATION_MANAGE) || !has(PERMISSION_KEYS.REPORT_QUERY_POPULATION)) return null;

  async function onAsk() {
    setLoading(true);
    setError(null);
    const result = await proposeCohortDsl(question);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGenerationId(result.data.id);
    setDslText(JSON.stringify(result.data.outputJson ?? {}, null, 2));
  }

  async function onRun() {
    if (!generationId) return;
    setLoading(true);
    setError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(dslText) as Record<string, unknown>;
    } catch {
      setLoading(false);
      setError('Not valid JSON');
      return;
    }
    const result = await executeCohortDsl(generationId, parsed);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onExecuted(result.data.execution);
    setGenerationId(null);
    setQuestion('');
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Ask in plain English — a deterministic stub drafts a starting DSL, not a real model; always review it below
        before running.
      </p>
      <Textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={2}
        placeholder="e.g. Patients over 60 with active diabetes"
        disabled={!!generationId}
      />
      {!generationId ? (
        <Button type="button" size="sm" variant="outline" disabled={loading || !question.trim()} onClick={onAsk}>
          {loading ? 'Drafting…' : 'Draft cohort DSL with AI'}
        </Button>
      ) : (
        <div className="space-y-2">
          <Textarea value={dslText} onChange={(e) => setDslText(e.target.value)} rows={6} className="font-mono text-xs" />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={loading} onClick={onRun}>
              {loading ? 'Running…' : 'Run this cohort'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setGenerationId(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
