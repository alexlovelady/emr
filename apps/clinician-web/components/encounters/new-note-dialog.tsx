'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { createNote } from '@/lib/actions/notes';
import type { NoteTemplate } from '@/lib/types';

export function NewNoteDialog({ encounterId, templates }: { encounterId: string; templates: NoteTemplate[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [noteType, setNoteType] = useState('');
  const [templateId, setTemplateId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createNote(encounterId, noteType, templateId || undefined);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setNoteType('');
    setTemplateId('');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-4 w-4" /> New note
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New note</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="noteType">Note type</Label>
            <Input id="noteType" value={noteType} onChange={(e) => setNoteType(e.target.value)} placeholder="progress_note" required />
          </div>
          {templates.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="templateId">Template (optional)</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger id="templateId">
                  <SelectValue placeholder="Blank note" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create note'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
