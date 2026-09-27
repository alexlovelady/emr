import { Building2 } from 'lucide-react';
import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { NewOrganizationDialog } from '@/components/organizations/new-organization-dialog';
import { OrganizationRowActions } from '@/components/organizations/organization-row-actions';
import type { OrganizationRow } from '@/lib/types';

export default async function OrganizationsPage() {
  const organizations = await callBackend<OrganizationRow[]>('/api/v1/organizations');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
          <p className="text-sm text-muted-foreground">{organizations.length} organizations</p>
        </div>
        <NewOrganizationDialog />
      </div>
      <Card>
        <CardContent className="pt-6">
          {organizations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Building2 className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No organizations yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>NPI</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell>{o.npi ?? '—'}</TableCell>
                    <TableCell>{o.status}</TableCell>
                    <TableCell>
                      <OrganizationRowActions organization={o} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
