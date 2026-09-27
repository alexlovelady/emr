'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import type { Allergy, DiagnosticReport, MedicationItem, Note, Problem } from '@/lib/types';

function EmptyRow({ message }: { message: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{message}</p>;
}

export function RecordsTabs({
  results,
  notes,
  problems,
  allergies,
  medications,
}: {
  results: DiagnosticReport[];
  notes: Note[];
  problems: Problem[];
  allergies: Allergy[];
  medications: MedicationItem[];
}) {
  return (
    <Tabs defaultValue="results">
      <TabsList className="flex-wrap">
        <TabsTrigger value="results">Results</TabsTrigger>
        <TabsTrigger value="notes">Visit notes</TabsTrigger>
        <TabsTrigger value="problems">Problems</TabsTrigger>
        <TabsTrigger value="allergies">Allergies</TabsTrigger>
        <TabsTrigger value="medications">Medications</TabsTrigger>
      </TabsList>

      <TabsContent value="results">
        {results.length === 0 ? (
          <EmptyRow message="No released results." />
        ) : (
          <ul className="divide-y divide-border">
            {results.map((r) => (
              <li key={r.id} className="space-y-1 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.displayName}</span>
                  <div className="flex gap-1.5">
                    {r.criticalFlag && <Badge variant="destructive">critical</Badge>}
                    {r.abnormalFlag && <Badge variant="warning">abnormal</Badge>}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{new Date(r.issuedAt).toLocaleDateString()}</p>
                {r.conclusion && <p className="text-muted-foreground">{r.conclusion}</p>}
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="notes">
        {notes.length === 0 ? (
          <EmptyRow message="No signed visit notes." />
        ) : (
          <ul className="divide-y divide-border">
            {notes.map((n) => (
              <li key={n.id} className="space-y-1 py-3 text-sm">
                <div className="font-medium">{n.noteType.replace(/_/g, ' ')}</div>
                <p className="text-xs text-muted-foreground">
                  Signed {n.signedAt ? new Date(n.signedAt).toLocaleDateString() : '—'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="problems">
        {problems.length === 0 ? (
          <EmptyRow message="No active problems." />
        ) : (
          <ul className="divide-y divide-border">
            {problems.map((p) => (
              <li key={p.id} className="py-3 text-sm">
                <div className="font-medium">{p.displayName}</div>
                <p className="text-xs text-muted-foreground">
                  {p.codeSystem} {p.code}
                  {p.onsetDate ? ` · onset ${p.onsetDate}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="allergies">
        {allergies.length === 0 ? (
          <EmptyRow message="No known allergies on file." />
        ) : (
          <ul className="divide-y divide-border">
            {allergies.map((a) => (
              <li key={a.id} className="py-3 text-sm">
                <div className="font-medium">{a.substance}</div>
                <p className="text-xs text-muted-foreground">
                  {a.reaction ?? 'no reaction recorded'}
                  {a.severity ? ` · ${a.severity}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="medications">
        {medications.length === 0 ? (
          <EmptyRow message="No active medications." />
        ) : (
          <ul className="divide-y divide-border">
            {medications.map((m) => (
              <li key={m.id} className="py-3 text-sm">
                <div className="font-medium">{m.medicationName}</div>
                <p className="text-xs text-muted-foreground">
                  {[m.dose, m.route, m.frequency].filter(Boolean).join(' · ') || '—'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}
