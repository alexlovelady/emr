import { Stethoscope } from 'lucide-react';
import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { NewPractitionerDialog } from '@/components/practitioners/new-practitioner-dialog';
import { PractitionerRowActions } from '@/components/practitioners/practitioner-row-actions';
import type { LocationRow, OrganizationRow, PractitionerRoleRow, PractitionerRow, RoleRow, UserRow } from '@/lib/types';

const PAGE_SIZE = 25;

export default async function PractitionersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number(pageParam ?? '0') || 0);
  const [fetched, users, organizations, locations, roles] = await Promise.all([
    callBackend<PractitionerRow[]>('/api/v1/practitioners', { query: { limit: String(PAGE_SIZE + 1), offset: String(page * PAGE_SIZE) } }),
    callBackend<UserRow[]>('/api/v1/users'),
    callBackend<OrganizationRow[]>('/api/v1/organizations'),
    callBackend<LocationRow[]>('/api/v1/locations'),
    callBackend<RoleRow[]>('/api/v1/roles'),
  ]);
  const hasMore = fetched.length > PAGE_SIZE;
  const practitioners = hasMore ? fetched.slice(0, PAGE_SIZE) : fetched;
  const orgName = (id: string) => organizations.find((o) => o.id === id)?.name ?? id;

  // No "assignments for these practitioners" bulk endpoint — same N+1-via-detail pattern already
  // used elsewhere at this scale (e.g. patient claim timelines, payment plans).
  const assignmentsByPractitioner = new Map<string, PractitionerRoleRow[]>(
    await Promise.all(
      practitioners.map(async (p) => [p.id, await callBackend<PractitionerRoleRow[]>(`/api/v1/practitioners/${p.id}/location-roles`)] as const),
    ),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Practitioners</h1>
        </div>
        <NewPractitionerDialog users={users} organizations={organizations} />
      </div>
      {(users.length === 0 || organizations.length === 0) && (
        <p className="text-sm text-muted-foreground">Create a user account and an organization first before adding a practitioner.</p>
      )}
      <Card>
        <CardContent className="pt-6">
          {practitioners.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Stethoscope className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No practitioners yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>NPI</TableHead>
                  <TableHead>Taxonomy code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {practitioners.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.displayName}</TableCell>
                    <TableCell>{orgName(p.organizationId)}</TableCell>
                    <TableCell>{p.npi ?? '—'}</TableCell>
                    <TableCell>{p.taxonomyCode ?? '—'}</TableCell>
                    <TableCell>{p.status}</TableCell>
                    <TableCell>
                      <PractitionerRowActions
                        practitioner={p}
                        locations={locations}
                        roles={roles}
                        assignments={assignmentsByPractitioner.get(p.id) ?? []}
                      />
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
