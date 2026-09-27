'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/chart/empty-state';
import { NewThreadDialog } from '@/components/chart/new-thread-dialog';
import { AiProposeTrigger } from '@/components/ai/ai-propose-trigger';
import { proposeMessageDraftReply } from '@/lib/actions/ai-generations';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { markThreadRead, replyToThread } from '@/lib/actions/messages';
import type { Message, MessageThread } from '@/lib/types';

function ThreadView({ patientId, thread }: { patientId: string; thread: MessageThread }) {
  const router = useRouter();
  const { has } = usePermissions();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/backend/patients/${patientId}/message-threads/${thread.id}/messages`)
      .then((r) => (r.ok ? r.json() : []))
      .then((msgs: Message[]) => {
        setMessages(msgs);
        if (msgs.some((m) => m.senderType !== 'staff' && !m.readAt)) {
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
    const res = await fetch(`/api/backend/patients/${patientId}/message-threads/${thread.id}/messages`);
    if (res.ok) setMessages(await res.json());
  }

  return (
    <div className="space-y-3 border-t border-border bg-muted/30 p-4">
      {messages === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <div key={m.id} className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.senderType === 'staff' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-card border border-border'}`}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className={`mt-1 text-xs ${m.senderType === 'staff' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                {m.senderType === 'staff' ? 'Staff' : 'Patient'} · {new Date(m.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
      {has(PERMISSION_KEYS.MESSAGE_MANAGE) && (
        <AiProposeTrigger
          label="Draft reply with AI"
          proposeFn={() => proposeMessageDraftReply(thread.id)}
          onAccept={(text) => setReply(text)}
        />
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

export function MessagesPanel({ threads, patientId }: { threads: MessageThread[]; patientId: string }) {
  const { has } = usePermissions();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {has(PERMISSION_KEYS.MESSAGE_MANAGE) && (
        <div className="flex justify-end">
          <NewThreadDialog patientId={patientId} />
        </div>
      )}
      {threads.length === 0 ? (
        <EmptyState icon={MessageSquare} message="No message threads." />
      ) : (
        <ul className="divide-y divide-border">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{t.subject}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleString() : '—'}
                  </div>
                </div>
                <Badge variant={t.status === 'open' ? 'outline' : 'success'}>{t.status}</Badge>
                {expanded === t.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {expanded === t.id && <ThreadView patientId={patientId} thread={t} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
