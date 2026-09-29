import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { RefillRequestsTable } from '@/components/medications/refill-requests-table';
import type { PendingRefillRequest, Patient } from '@/lib/types';

export default async function RefillRequestsPage() {
  const [requests, patients] = await Promise.all([
    callBackend<PendingRefillRequest[]>('/api/v1/prescription-refill-requests'),
    callBackend<Patient[]>('/api/v1/patients'),
  ]);
  const patientsById = new Map(patients.map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Refill requests</h1>
        <p className="text-sm text-muted-foreground">{requests.length} requests awaiting a decision</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <RefillRequestsTable requests={requests} patientsById={patientsById} />
        </CardContent>
      </Card>
    </div>
  );
}
