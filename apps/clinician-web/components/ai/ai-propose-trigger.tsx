'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { AiGenerationReview } from './ai-generation-review';
import type { ActionResult } from '@/lib/actions/action-result';
import type { AiGeneration } from '@/lib/types';

/** Shared "Draft with AI" button — wraps any propose action, then hands the result to AiGenerationReview. */
export function AiProposeTrigger({
  label,
  proposeFn,
  onAccept,
  disabled,
}: {
  label: string;
  proposeFn: () => Promise<ActionResult<AiGeneration>>;
  onAccept?: (text: string) => void;
  disabled?: boolean;
}) {
  const [generation, setGeneration] = useState<AiGeneration | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function propose() {
    setLoading(true);
    setError(null);
    const result = await proposeFn();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGeneration(result.data);
  }

  if (generation) {
    return <AiGenerationReview generation={generation} onAccept={onAccept} onReset={() => setGeneration(null)} />;
  }

  return (
    <div className="space-y-1.5">
      <Button type="button" variant="outline" size="sm" onClick={propose} disabled={disabled || loading}>
        {loading ? 'Drafting…' : label}
      </Button>
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
