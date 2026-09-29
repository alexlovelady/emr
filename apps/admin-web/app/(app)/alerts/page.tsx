import { BellOff } from 'lucide-react';
import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { AlertRowActions } from '@/components/alerts/alert-row-actions';
import type { AlertRow } from '@/lib/types';

const SEVERITY_VARIANT = { critical: 'destructive', warning: 'warning', info: 'secondary' } as const;

export default async function AlertsPage() {
  const { alerts } = await callBackend<{ alerts: AlertRow[] }>('/api/v1/alerts');
  const open = alerts.filter((a) => a.status === 'open');
  const resolved = alerts.filter((a) => a.status === 'resolved');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
        <p className="text-sm text-muted-foreground">
          {open.length} open — evaluated every 60s against real backup/outbox/HL7 pipeline health (see the alert&apos;s
          own rule for what it&apos;s watching)
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          {open.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <BellOff className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No open alerts.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {open.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Badge variant={SEVERITY_VARIANT[a.severity]}>{a.severity}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {a.title}
                      {Object.keys(a.detail).length > 0 && (
                        <div className="text-xs text-muted-foreground">{JSON.stringify(a.detail)}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.ruleKey}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(a.openedAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <AlertRowActions alert={a} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {resolved.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Resolved</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Resolved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolved.slice(0, 50).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Badge variant="outline">{a.severity}</Badge>
                    </TableCell>
                    <TableCell className="font-medium text-muted-foreground">{a.title}</TableCell>
                    <TableCell className="text-muted-foreground">{a.ruleKey}</TableCell>
                    <TableCell className="text-muted-foreground">{a.resolvedAt ? new Date(a.resolvedAt).toLocaleString() : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
