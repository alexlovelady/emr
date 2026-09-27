'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EmptyState } from '@/components/chart/empty-state';
import { NewNoteDialog } from '@/components/encounters/new-note-dialog';
import { NoteEditor } from '@/components/encounters/note-editor';
import { AiProposeTrigger } from '@/components/ai/ai-propose-trigger';
import { proposeEncounterSummary } from '@/lib/actions/ai-generations';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { FileText } from 'lucide-react';
import type { Note, NoteTemplate } from '@/lib/types';

export function NotesPanel({ notes, templates, encounterId }: { notes: Note[]; templates: NoteTemplate[]; encounterId: string }) {
  const { has } = usePermissions();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Notes</CardTitle>
        <NewNoteDialog encounterId={encounterId} templates={templates} />
      </CardHeader>
      <CardContent className="space-y-4">
        {has(PERMISSION_KEYS.NOTE_CREATE) && (
          <AiProposeTrigger label="Summarize encounter with AI" proposeFn={() => proposeEncounterSummary(encounterId)} />
        )}
        {notes.length === 0 ? (
          <EmptyState icon={FileText} message="No notes yet — create one to start documenting this visit." />
        ) : (
          <Tabs defaultValue={notes[0]?.id ?? ''}>
            <TabsList className="mb-4 flex-wrap">
              {notes.map((note) => (
                <TabsTrigger key={note.id} value={note.id}>
                  {note.noteType.replace(/_/g, ' ')}
                </TabsTrigger>
              ))}
            </TabsList>
            {notes.map((note) => (
              <TabsContent key={note.id} value={note.id}>
                <NoteEditor note={note} encounterId={encounterId} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
