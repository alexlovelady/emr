import { Building2 } from 'lucide-react';
import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { NewOrganizationDialog } from '@/components/organizations/new-organization-dialog';
import { OrganizationRowActions } from '@/components/organizations/organization-row-actions';
import type { OrganizationRow } from '@/lib/types';

const PAGE_SIZE = 25;

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number(pageParam ?? '0') || 0);
  const fetched = await callBackend<OrganizationRow[]>('/api/v1/organizations', {
    query: { limit: String(PAGE_SIZE + 1), offset: String(page * PAGE_SIZE) },
  });
  const hasMore = fetched.length > PAGE_SIZE;
  const organizations = hasMore ? fetched.slice(0, PAGE_SIZE) : fetched;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
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
          <Pagination page={page} hasMore={hasMore} />
        </CardContent>
      </Card>
    </div>
  );
}
