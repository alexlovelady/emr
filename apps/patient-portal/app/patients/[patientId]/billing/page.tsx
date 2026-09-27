import { Receipt } from 'lucide-react';
import { callBackendOr } from '@/lib/api-proxy';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PayBalanceForm } from '@/components/billing/pay-balance-form';
import type { PatientLedger } from '@/lib/types';

export default async function BillingPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const ledger = await callBackendOr<PatientLedger | null>(`/api/v1/portal/patients/${patientId}/ledger`, null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Billing</CardTitle>
        {ledger && <span className="text-lg font-semibold">Balance: ${ledger.balance}</span>}
      </CardHeader>
      <CardContent className="space-y-4">
        {ledger && Number(ledger.balance) > 0 && <PayBalanceForm patientId={patientId} balance={ledger.balance} />}
        {!ledger || ledger.entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Receipt className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">No billing activity on file.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {ledger.entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2.5">
                <span>{e.description}</span>
                <span className={Number(e.amount) < 0 ? 'text-emerald-600' : ''}>${e.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
