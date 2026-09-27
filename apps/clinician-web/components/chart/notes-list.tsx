import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { SignedNote } from '@/lib/types';

export function NotesList({ notes }: { notes: SignedNote[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Signed notes</CardTitle>
      </CardHeader>
      <CardContent>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No signed notes.</p>
        ) : (
          <Tabs defaultValue={notes[0]?.id ?? ''}>
            <TabsList className="mb-3 flex-wrap">
              {notes.map((note) => (
                <TabsTrigger key={note.id} value={note.id}>
                  {note.noteType} · {note.signedAt ? new Date(note.signedAt).toLocaleDateString() : '—'}
                </TabsTrigger>
              ))}
            </TabsList>
            {notes.map((note) => (
              <TabsContent key={note.id} value={note.id} className="space-y-3 text-sm">
                {Object.entries(note.content).map(([section, text]) => (
                  <div key={section}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section}</div>
                    <p className="whitespace-pre-wrap">{text}</p>
                  </div>
                ))}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
