import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { CodingQueueTable } from '@/components/billing/coding-queue-table';
import type { Charge } from '@/lib/types';

export default async function CodingQueuePage() {
  const charges = await callBackend<Charge[]>('/api/v1/coding-queue');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Coding queue</h1>
        <p className="text-sm text-muted-foreground">{charges.length} charges awaiting coding</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <CodingQueueTable charges={charges} />
        </CardContent>
      </Card>
    </div>
  );
}
