'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { ClipboardList } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/chart/empty-state';
import { NewOrderDialog } from '@/components/encounters/new-order-dialog';
import { usePermissions } from '@/components/providers/permissions-provider';
import { PERMISSION_KEYS } from '@/lib/permission-keys';
import { cancelOrder } from '@/lib/actions/orders';
import type { Order } from '@/lib/types';

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'entered_in_error']);

export function OrdersPanel({ orders, encounterId }: { orders: Order[]; encounterId: string }) {
  const { has } = usePermissions();
  const [isPending, startTransition] = useTransition();
  const canManage = has(PERMISSION_KEYS.ORDER_MANAGE);

  function onCancel(id: string) {
    startTransition(async () => {
      const result = await cancelOrder(id, encounterId);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Orders</CardTitle>
        {canManage && <NewOrderDialog encounterId={encounterId} />}
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <EmptyState icon={ClipboardList} message="No orders placed for this visit." />
        ) : (
          <ul className="divide-y divide-border">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{o.displayName}</div>
                  <div className="text-xs text-muted-foreground">{o.orderType}</div>
                </div>
                <Badge variant={o.priority === 'stat' ? 'destructive' : o.priority === 'urgent' ? 'warning' : 'outline'}>{o.priority}</Badge>
                <Badge variant="outline">{o.status}</Badge>
                {canManage && !TERMINAL_STATUSES.has(o.status) && (
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => onCancel(o.id)}>
                    Cancel
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
