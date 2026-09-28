'use client';

import { CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/chart/empty-state';
import { NewPaymentPlanDialog } from '@/components/chart/new-payment-plan-dialog';
import { PayInstallmentDialog } from '@/components/chart/pay-installment-dialog';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import type { PaymentPlanWithInstallments } from '@/lib/types';

const PLAN_STATUS_VARIANT: Record<string, 'success' | 'outline' | 'destructive'> = {
  active: 'outline',
  completed: 'success',
  cancelled: 'destructive',
};

function PlanCard({ patientId, item }: { patientId: string; item: PaymentPlanWithInstallments }) {
  const { has } = usePermissions();
  const { plan, installments } = item;

  return (
    <li className="space-y-2 py-2.5">
      <div className="flex items-center gap-3 text-sm">
        <span className="flex-1">
          ${plan.totalAmount} over {plan.installmentCount} {plan.frequency} installments, starting{' '}
          {new Date(plan.startDate).toLocaleDateString()}
        </span>
        <Badge variant={PLAN_STATUS_VARIANT[plan.status] ?? 'outline'}>{plan.status}</Badge>
      </div>
      <ul className="ml-4 space-y-1.5">
        {installments.map((i) => (
          <li key={i.id} className="flex items-center gap-3 text-xs">
            <span className="flex-1 text-muted-foreground">
              #{i.sequenceNumber} — ${i.amount} due {new Date(i.dueDate).toLocaleDateString()}
            </span>
            <Badge variant={i.status === 'paid' ? 'success' : i.status === 'pending' ? 'outline' : 'destructive'}>{i.status}</Badge>
            {i.status === 'pending' && has(PERMISSION_KEYS.PAYMENT_RECORD) && (
              <PayInstallmentDialog planId={plan.id} installment={i} patientId={patientId} />
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

export function PaymentPlansSection({ patientId, paymentPlans }: { patientId: string; paymentPlans: PaymentPlanWithInstallments[] }) {
  const { has } = usePermissions();

  return (
    <div className="space-y-3 border-t border-border pt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Payment plans</h3>
        {has(PERMISSION_KEYS.PAYMENT_RECORD) && <NewPaymentPlanDialog patientId={patientId} />}
      </div>
      {paymentPlans.length === 0 ? (
        <EmptyState icon={CalendarClock} message="No payment plans on file." />
      ) : (
        <ul className="divide-y divide-border">
          {paymentPlans.map((item) => (
            <PlanCard key={item.plan.id} patientId={patientId} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
