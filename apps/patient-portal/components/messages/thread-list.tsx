'use client';

import { useState } from 'react';
import { MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ThreadView } from './thread-view';
import type { MessageThread } from '@/lib/types';

export function ThreadList({ patientId, threads }: { patientId: string; threads: MessageThread[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <MessageSquare className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">No message threads.</p>
      </div>
    );
  }

  return (
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
  );
}
