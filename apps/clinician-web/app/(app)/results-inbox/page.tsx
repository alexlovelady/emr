import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { ResultsInboxTable } from '@/components/results/results-inbox-table';
import type { DiagnosticReport, Patient } from '@/lib/types';

export default async function ResultsInboxPage() {
  const [reports, patients] = await Promise.all([
    callBackend<DiagnosticReport[]>('/api/v1/results/inbox'),
    callBackend<Patient[]>('/api/v1/patients'),
  ]);
  const patientsById = new Map(patients.map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Results inbox</h1>
        <p className="text-sm text-muted-foreground">{reports.length} results awaiting review</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <ResultsInboxTable reports={reports} patientsById={patientsById} />
        </CardContent>
      </Card>
    </div>
  );
}
