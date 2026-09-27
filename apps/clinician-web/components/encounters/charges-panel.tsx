import { DollarSign } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/chart/empty-state';
import { CaptureChargeDialog } from '@/components/encounters/capture-charge-dialog';
import { CreateClaimDialog } from '@/components/encounters/create-claim-dialog';
import type { Charge } from '@/lib/types';

export function ChargesPanel({ charges, patientId, encounterId }: { charges: Charge[]; patientId: string; encounterId: string }) {
  const codedCharges = charges.filter((c) => c.status === 'coded');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Charges</CardTitle>
        <div className="flex gap-2">
          <CaptureChargeDialog patientId={patientId} encounterId={encounterId} />
          <CreateClaimDialog patientId={patientId} encounterId={encounterId} codedCharges={codedCharges} />
        </div>
      </CardHeader>
      <CardContent>
        {charges.length === 0 ? (
          <EmptyState icon={DollarSign} message="No charges captured for this visit." />
        ) : (
          <ul className="divide-y divide-border">
            {charges.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {c.code} — {c.description}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ${c.unitPrice} × {c.units} · {c.diagnosisCodes.join(', ') || 'no diagnosis codes'}
                  </div>
                </div>
                <Badge variant={c.status === 'billed' ? 'success' : c.status === 'coded' ? 'outline' : 'warning'}>{c.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
