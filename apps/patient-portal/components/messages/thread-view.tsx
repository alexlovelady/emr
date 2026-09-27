'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { replyToThread, markThreadRead } from '@/lib/actions/messages';
import type { Message, MessageThread } from '@/lib/types';

export function ThreadView({ patientId, thread }: { patientId: string; thread: MessageThread }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/backend/portal/patients/${patientId}/message-threads/${thread.id}/messages`)
      .then((r) => (r.ok ? r.json() : []))
      .then((msgs: Message[]) => {
        setMessages(msgs);
        if (msgs.some((m) => m.senderType !== 'portal' && !m.readAt)) {
          markThreadRead(patientId, thread.id);
        }
      })
      .catch(() => setMessages([]));
  }, [patientId, thread.id]);

  async function onReply() {
    if (!reply.trim()) return;
    setSending(true);
    const result = await replyToThread(patientId, thread.id, reply);
    setSending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setReply('');
    router.refresh();
    const res = await fetch(`/api/backend/portal/patients/${patientId}/message-threads/${thread.id}/messages`);
    if (res.ok) setMessages(await res.json());
  }

  return (
    <div className="space-y-3 border-t border-border bg-muted/30 p-4">
      {messages === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.senderType === 'portal' ? 'ml-auto bg-primary text-primary-foreground' : 'border border-border bg-card'}`}
            >
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className={`mt-1 text-xs ${m.senderType === 'portal' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                {m.senderType === 'portal' ? 'You' : 'Care team'} · {new Date(m.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Reply…" className="flex-1" />
        <Button size="sm" onClick={onReply} disabled={sending}>
          Send
        </Button>
      </div>
    </div>
  );
}
