'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { proposeChartQa } from '@/lib/actions/ai-generations';
import { AiProposeTrigger } from '@/components/ai/ai-propose-trigger';

export function AiChartQaDialog({ patientId }: { patientId: string }) {
  const { has } = usePermissions();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');

  if (!has(PERMISSION_KEYS.PATIENT_READ_CLINICAL)) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Sparkles className="mr-1.5 h-4 w-4" /> Ask AI
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask about this chart</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            placeholder="e.g. What is this patient's most recent HbA1c?"
          />
          <AiProposeTrigger label="Ask AI" disabled={!question.trim()} proposeFn={() => proposeChartQa(patientId, question)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
