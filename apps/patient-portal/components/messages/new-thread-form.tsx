'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { createThread } from '@/lib/actions/messages';

export function NewThreadForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        New message
      </Button>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createThread(patientId, subject, body);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setSubject('');
    setBody('');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-border p-4">
      <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
      <Textarea placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} rows={3} required />
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
