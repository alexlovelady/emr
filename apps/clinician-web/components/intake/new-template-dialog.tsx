'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { createIntakeTemplate } from '@/lib/actions/intake-templates';
import type { IntakeFormField } from '@/lib/types';

const FIELD_TYPES: IntakeFormField['type'][] = ['text', 'textarea', 'number', 'boolean', 'date', 'select'];

interface DraftField {
  key: string;
  label: string;
  type: IntakeFormField['type'];
  required: boolean;
  options: string;
}

const EMPTY_FIELD: DraftField = { key: '', label: '', type: 'text', required: false, options: '' };

export function NewTemplateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [fields, setFields] = useState<DraftField[]>([{ ...EMPTY_FIELD }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateField(i: number, patch: Partial<DraftField>) {
    setFields((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const schema = fields
      .filter((f) => f.key && f.label)
      .map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        // The backend's options field is z.array(z.string()).optional() — not nullable, so it
        // must be omitted entirely (not sent as null) when there are no options.
        ...(f.type === 'select' && f.options ? { options: f.options.split(',').map((o) => o.trim()).filter(Boolean) } : {}),
      }));
    const result = await createIntakeTemplate(name, schema);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setName('');
    setFields([{ ...EMPTY_FIELD }]);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New intake form template</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="templateName">Template name</Label>
            <Input id="templateName" value={name} onChange={(e) => setName(e.target.value)} placeholder="New patient intake" required />
          </div>
          <div className="space-y-2">
            <Label>Fields</Label>
            {fields.map((field, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input placeholder="key" value={field.key} onChange={(e) => updateField(i, { key: e.target.value })} />
                  <Input placeholder="Label" value={field.label} onChange={(e) => updateField(i, { label: e.target.value })} />
                  <Button type="button" size="icon" variant="ghost" onClick={() => setFields((f) => f.filter((_, idx) => idx !== i))} disabled={fields.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <Select value={field.type} onValueChange={(v) => updateField(i, { type: v as IntakeFormField['type'] })}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={field.required} onChange={(e) => updateField(i, { required: e.target.checked })} className="h-4 w-4 rounded border-input" />
                    Required
                  </label>
                  {field.type === 'select' && (
                    <Input
                      placeholder="option1, option2, option3"
                      value={field.options}
                      onChange={(e) => updateField(i, { options: e.target.value })}
                      className="flex-1"
                    />
                  )}
                </div>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setFields((f) => [...f, { ...EMPTY_FIELD }])}>
              <Plus className="mr-1.5 h-4 w-4" /> Add field
            </Button>
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
