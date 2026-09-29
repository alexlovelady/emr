import { MapPin } from 'lucide-react';
import { callBackend } from '@/lib/api-proxy';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { NewLocationDialog } from '@/components/locations/new-location-dialog';
import { LocationRowActions } from '@/components/locations/location-row-actions';
import type { LocationRow, OrganizationRow } from '@/lib/types';

const PAGE_SIZE = 25;

export default async function LocationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number(pageParam ?? '0') || 0);
  const [fetched, organizations] = await Promise.all([
    callBackend<LocationRow[]>('/api/v1/locations', { query: { limit: String(PAGE_SIZE + 1), offset: String(page * PAGE_SIZE) } }),
    callBackend<OrganizationRow[]>('/api/v1/organizations'),
  ]);
  const hasMore = fetched.length > PAGE_SIZE;
  const locations = hasMore ? fetched.slice(0, PAGE_SIZE) : fetched;
  const orgName = (id: string) => organizations.find((o) => o.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Locations</h1>
        </div>
        <NewLocationDialog organizations={organizations} />
      </div>
      {organizations.length === 0 && (
        <p className="text-sm text-muted-foreground">Create an organization first before adding a location.</p>
      )}
      <Card>
        <CardContent className="pt-6">
          {locations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <MapPin className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No locations yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Time zone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell>{orgName(l.organizationId)}</TableCell>
                    <TableCell>{l.addressLine1 ? `${l.addressLine1}, ${l.city ?? ''} ${l.state ?? ''} ${l.postalCode ?? ''}` : '—'}</TableCell>
                    <TableCell>{l.timeZone}</TableCell>
                    <TableCell>{l.status}</TableCell>
                    <TableCell>
                      <LocationRowActions location={l} />
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
