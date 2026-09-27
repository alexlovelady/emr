'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { submitIntakeResponse } from '@/lib/actions/intake-responses';
import type { IntakeFormResponse, IntakeFormTemplate } from '@/lib/types';

export function IntakeResponseForm({ patientId, response, template }: { patientId: string; response: IntakeFormResponse; template: IntakeFormTemplate }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, unknown>>(response.answers ?? {});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await submitIntakeResponse(patientId, response.id, answers);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      {template.schema.map((field) => {
        const value = answers[field.key];
        return (
          <div key={field.key} className="space-y-1.5">
            <Label>
              {field.label}
              {field.required && <span className="text-destructive"> *</span>}
            </Label>
            {field.type === 'textarea' ? (
              <Textarea value={(value as string) ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [field.key]: e.target.value }))} />
            ) : field.type === 'boolean' ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) => setAnswers((a) => ({ ...a, [field.key]: e.target.checked }))}
                  className="h-4 w-4 rounded border-input"
                />
                Yes
              </label>
            ) : field.type === 'select' ? (
              <Select value={(value as string) ?? ''} onValueChange={(v) => setAnswers((a) => ({ ...a, [field.key]: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {(field.options ?? []).map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                value={(value as string) ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value }))}
              />
            )}
          </div>
        );
      })}
      {error && <Alert variant="destructive">{error}</Alert>}
      <Button size="sm" onClick={onSubmit} disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit form'}
      </Button>
    </div>
  );
}
