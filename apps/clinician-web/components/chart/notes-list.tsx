import { FileText } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EmptyState } from '@/components/chart/empty-state';
import type { SignedNote } from '@/lib/types';

export function NotesList({ notes }: { notes: SignedNote[] }) {
  if (notes.length === 0) {
    return <EmptyState icon={FileText} message="No signed notes." />;
  }

  return (
    <Tabs defaultValue={notes[0]?.id ?? ''}>
      <TabsList className="mb-4 flex-wrap">
        {notes.map((note) => (
          <TabsTrigger key={note.id} value={note.id}>
            {note.noteType.replace(/_/g, ' ')} &middot; {note.signedAt ? new Date(note.signedAt).toLocaleDateString() : '—'}
          </TabsTrigger>
        ))}
      </TabsList>
      {notes.map((note) => (
        <TabsContent key={note.id} value={note.id} className="space-y-4 text-sm">
          {Object.entries(note.content).map(([section, text]) => (
            <div key={section}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section}</div>
              <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
            </div>
          ))}
        </TabsContent>
      ))}
    </Tabs>
  );
}
